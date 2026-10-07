"""Shared garment solver settings and body-only collision surfaces."""
import bpy
import bmesh
import json
import struct
import math
from mathutils import Vector


def inherited_property(obj, name, default=None):
    # glTF can put primitive meshes below the node carrying its extras.
    while obj is not None:
        if name in obj:
            return obj[name]
        obj = obj.parent
    return default


def restore_gltf_physics(path):
    """The importer reparents skinned primitives away from their extras node."""
    with path.open('rb') as stream:
        header = stream.read(20)
        if len(header) != 20 or header[:4] != b'glTF':
            return
        document = json.loads(stream.read(struct.unpack_from('<I', header, 12)[0]))
    meshes = document.get('meshes', [])
    for node in document.get('nodes', []):
        fabric = node.get('extras', {}).get('studioFabric')
        index = node.get('mesh')
        if fabric not in {'silk', 'cotton', 'structured'} or index is None:
            continue
        mesh_name = meshes[index].get('name') or 'Mesh_' + str(index)
        for obj in bpy.data.objects:
            if obj.type == 'MESH' and obj.data.name == mesh_name:
                obj['studioFabric'] = fabric


def configure_cloth(modifier, pin_group, fabric, start, end, quality=16):
    settings = modifier.settings
    settings.quality = quality
    settings.mass = .075
    settings.air_damping = 3
    settings.vertex_group_mass = pin_group
    settings.pin_stiffness = 1
    # Retain one rest shape. Animated pins move the garment without changing
    # its natural pleats each time the source skirt bones rotate.
    settings.use_dynamic_mesh = False
    stretch, shear, bend = {
        'silk': (30, 15, .3),
        'cotton': (45, 20, 1.1),
        'structured': (60, 25, 2.5),
    }.get(fabric, (45, 20, 1.1))
    settings.tension_stiffness = stretch
    settings.compression_stiffness = stretch
    settings.shear_stiffness = shear
    settings.bending_model = 'ANGULAR'
    settings.bending_stiffness = bend
    settings.bending_damping = 1.5
    settings.tension_damping = 10
    settings.compression_damping = 10
    settings.shear_damping = 8
    contact = modifier.collision_settings
    contact.use_collision = True
    contact.collision_quality = 12
    contact.distance_min = .0025
    contact.use_self_collision = True
    contact.self_distance_min = .001
    contact.self_friction = .5
    contact.self_impulse_clamp = .5
    modifier.point_cache.frame_start = start
    modifier.point_cache.frame_end = end


def body_contact_surface(source, collection):
    """Collide with skin, not open shirt/skirt seams in the same glTF mesh."""
    skin = {i for i, material in enumerate(source.data.materials)
            if material and material.name.endswith('_skin')}
    if not any(p.material_index in skin for p in source.data.polygons):
        return None
    proxy = source.copy()
    proxy.data = source.data.copy()
    proxy.name = source.name + '_BodyContact'
    collection.objects.link(proxy)
    proxy.hide_render = True
    proxy.display_type = 'WIRE'
    mesh = bmesh.new()
    mesh.from_mesh(proxy.data)
    bmesh.ops.delete(mesh, geom=[f for f in mesh.faces if f.material_index not in skin], context='FACES')
    bmesh.ops.delete(mesh, geom=[v for v in mesh.verts if not v.link_faces], context='VERTS')
    mesh.to_mesh(proxy.data)
    mesh.free()
    proxy.data.update()
    proxy.modifiers.new('Body contact', 'COLLISION')
    proxy.collision.thickness_outer = .001
    proxy.collision.cloth_friction = 1
    return proxy


def capsule_surface(a, b, radius, segments=12):
    """One closed rounded surface, without overlapping cylinder end caps."""
    a, b = Vector(a), Vector(b)
    delta = b - a
    axis = delta.normalized() if delta.length > 1e-8 else Vector((0, 0, 1))
    basis = axis.to_track_quat('Z', 'Y').to_matrix()
    points = [tuple(a - axis * radius)]
    rings = []
    for end, angles in [(a, [-3*math.pi/8, -math.pi/4, -math.pi/8, 0]),
                        (b, [0, math.pi/8, math.pi/4, 3*math.pi/8])]:
        for angle in angles:
            ring = []
            for i in range(segments):
                turn = i * math.tau / segments
                local = Vector((radius*math.cos(angle)*math.cos(turn),
                                radius*math.cos(angle)*math.sin(turn),
                                radius*math.sin(angle)))
                ring.append(len(points))
                points.append(tuple(end + basis @ local))
            rings.append(ring)
    top = len(points)
    points.append(tuple(b + axis * radius))
    faces = [(0, rings[0][(i+1) % segments], rings[0][i]) for i in range(segments)]
    for first, second in zip(rings, rings[1:]):
        faces.extend((first[i], first[(i+1) % segments], second[(i+1) % segments], second[i])
                     for i in range(segments))
    faces.extend((rings[-1][i], rings[-1][(i+1) % segments], top) for i in range(segments))
    return points, faces
