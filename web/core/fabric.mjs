// Metre/second units. Compliance stays independent of the rendering frame rate.
export const FABRICS={
 cotton:{stretch:2e-7,bend:3e-5,anchor:1.5e-4,damping:7,gravity:.65,wind:1,drag:.22},
 silk:{stretch:3e-7,bend:9e-5,anchor:3e-4,damping:4.5,gravity:.5,wind:1.8,drag:.15},
 structured:{stretch:8e-8,bend:8e-6,anchor:7e-5,damping:10,gravity:.85,wind:.6,drag:.35},
};
export function fabricParameters(name='cotton',quality='balanced'){
 return {...(FABRICS[name]||FABRICS.cotton),substeps:quality==='cinematic'?8:quality==='high'?4:2,iterations:quality==='balanced'?2:3};
}
