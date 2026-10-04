export function sourceSlot(catalog,song,role){return catalog?.gameLayouts?.[song]?.sourceSlots[Number(role)-1]||Number(role);}
export function roleSlot(catalog,song,source){const order=catalog?.gameLayouts?.[song]?.sourceSlots;if(!order)return Number(source);const i=order.indexOf(Number(source));return i<0?Number(source):i+1;}
