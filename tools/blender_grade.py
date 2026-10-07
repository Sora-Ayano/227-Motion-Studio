"""Editor color filters in the compositor; sRGB grading, scene-linear output."""
import bpy

def editor_grade(tree, image, settings):
    if settings.get('green'):
        return image
    nodes, links = tree.nodes, tree.links
    def op(operation, a, b=None):
        node = nodes.new('ShaderNodeMath' if bpy.app.version >= (5,0,0) else 'CompositorNodeMath');node.operation = operation
        for i, value in enumerate((a, b)):
            if value is None:continue
            if isinstance(value, (int, float)):node.inputs[i].default_value = value
            else:links.new(value, node.inputs[i])
        return node.outputs[0]
    add = lambda a, b: op('ADD', a, b)
    sub = lambda a, b: op('SUBTRACT', a, b)
    mul = lambda a, b: op('MULTIPLY', a, b)
    power = lambda a, b: op('POWER', a, b)
    clamp = lambda a: op('MINIMUM', op('MAXIMUM', a, 0), 1)
    mix = lambda a, b, t: add(mul(a, sub(1, t)), mul(b, t))
    def smooth(a, b, x):
        t = clamp(mul(sub(x, a), 1 / (b - a)))
        return mul(mul(t, t), sub(3, mul(2, t)))
    separate = nodes.new('CompositorNodeSeparateColor');separate.mode = 'RGB';links.new(image, separate.inputs['Image'])
    render = settings.get('rendering', {});exposure = 2 ** settings.get('exposure', -.35)
    if render.get('enabled'):exposure *= render.get('exposure', 1)
    c = []
    for channel in ['Red', 'Green', 'Blue']:
        v = op('MAXIMUM', mul(separate.outputs[channel], exposure), 0)
        if render.get('enabled') and render.get('filmic'):
            v = clamp(op('DIVIDE', mul(v, add(mul(v, 2.51), .03)), add(mul(v, add(mul(v, 2.43), .59)), .14)))
        c.append(mix(sub(mul(power(v, 1 / 2.4), 1.055), .055), mul(v, 12.92), op('LESS_THAN', v, .0031308)))
    luma = add(add(mul(c[0], .2126), mul(c[1], .7152)), mul(c[2], .0722))
    preset = settings.get('filter', 'original');g = c
    saturation = lambda amount: [mix(luma, v, amount) for v in c]
    if preset == 'clear':g = [add(mul(sub(v, .5), 1.04), .52) for v in saturation(1.12)]
    elif preset in ['warm', 'cool']:
        g = [mul(v, weight) for v, weight in zip(c, (1.07, 1.02, .94) if preset == 'warm' else (.94, 1.01, 1.08))]
    elif preset == 'cinema':g = [add(add(mul(sub(v, .5), 1.13), .5), shift) for v, shift in zip(saturation(.88), (.025, .012, -.018))]
    elif preset == 'soft':g = [add(mul(v, sub(1, mul(.06, smooth(.55, 1, luma)))), mul(.007, smooth(.25, 0, luma))) for v in saturation(.97)]
    elif preset == 'mono':g = [luma] * 3
    elif preset == 'kyoani':
        high, shadow = smooth(.45, .98, luma), sub(1, smooth(.05, .48, luma))
        g = [mul(add(add(v, mul(h, high)), mul(s, shadow)), sub(1, mul(.055, high))) for v, h, s in zip(saturation(1.035), (.012, .004, -.008), (-.007, .003, .012))]
    elif preset == 'pastel':g = [mul(add(v, mul(shift, sub(1, luma))), sub(1, mul(.055, smooth(.6, 1, luma)))) for v, shift in zip(saturation(.88), (.014, .005, .012))]
    elif preset == 'cel':g = [mul(add(mul(sub(v, .5), 1.045), .5), sub(1, mul(.035, smooth(.75, 1, luma)))) for v in saturation(1.07)]
    elif preset == 'retro':g = [mul(add(mul(v, .95), shift), tint) for v, shift, tint in zip(saturation(.8), (.018, .011, .004), (1.025, 1, .95))]
    elif preset in ['night', 'sunset']:
        tint, shift = ((.82, .94, 1.06), (.008, .005, .025)) if preset == 'night' else ((1.04, .96, .88), (.016, .005, 0))
        g = [add(mul(v, t), mul(s, sub(1, luma))) for v, t, s in zip(c, tint, shift)]
        if preset == 'sunset':g = [mul(v, sub(1, mul(.05, smooth(.6, 1, luma)))) for v in g]
    elif preset in ['reference-night', 'reference-petal', 'anime-pink']:
        sat, tint, shift, threshold, reduction = {
            'reference-night': (1.02, (.965, .98, 1.015), (-.006, .002, .014), .6, .055),
            'reference-petal': (.96, (1.018, 1, .98), (.009, .003, .007), .58, .065),
            'anime-pink': (.96, (1, 1, 1), (.018, .002, .012), .55, .065),
        }[preset]
        g = [mul(add(mul(v, t), mul(s, sub(1, luma))), sub(1, mul(reduction, smooth(threshold, 1, luma)))) for v, t, s in zip(saturation(sat), tint, shift)]
    combine = nodes.new('CompositorNodeCombineColor');combine.mode = 'RGB'
    for channel, source, graded in zip(['Red', 'Green', 'Blue'], c, g):
        v = clamp(mix(source, graded, settings.get('filterStrength', 1)))
        linear = mix(power(mul(add(v, .055), 1 / 1.055), 2.4), mul(v, 1 / 12.92), op('LESS_THAN', v, .04045))
        links.new(linear, combine.inputs[channel])
    links.new(separate.outputs['Alpha'], combine.inputs['Alpha']);result = combine.outputs['Image']
    vignette = render.get('vignette', 0) if render.get('enabled') else 0
    if vignette:
        mask = nodes.new('CompositorNodeEllipseMask');blur = nodes.new('CompositorNodeBlur')
        if 'Size' in mask.inputs:mask.inputs['Size'].default_value = (.82, .82 * settings['width'] / settings['height'])
        else:mask.width, mask.height = .82, .82 * settings['width'] / settings['height']
        size = (max(1, int(settings['width'] * .16)), max(1, int(settings['height'] * .16)))
        if 'Type' in blur.inputs:blur.inputs['Type'].default_value = 'Gaussian';blur.inputs['Size'].default_value = size
        else:blur.filter_type = 'GAUSS';blur.size_x, blur.size_y = size
        links.new(mask.outputs['Mask'], blur.inputs['Image'])
        multiply = nodes.new('ShaderNodeMixRGB' if bpy.app.version >= (5,0,0) else 'CompositorNodeMixRGB');multiply.blend_type = 'MULTIPLY';multiply.inputs[0].default_value = 1;links.new(result, multiply.inputs[1]);links.new(add(1 - vignette, mul(blur.outputs['Image'], vignette)), multiply.inputs[2]);result = multiply.outputs[0]
    return result
