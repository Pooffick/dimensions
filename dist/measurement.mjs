// All measurements use original image pixels, never screen pixels or view zoom.
export function pixelsPerReference(scale) {
  return scale.source === 'cm' ? scale.distance * scale.dpi / 2.54 : scale.distance;
}
export function validScale(s) {
  return !!s && ['cm','px'].includes(s.source) && [s.distance,s.real].every(n => Number.isFinite(n) && n >= 1e-6 && n <= 1e12) && Number.isFinite(s.dpi) && s.dpi >= 1 && s.dpi <= 100000 && typeof s.unit === 'string' && s.unit.trim().length > 0 && s.unit.length <= 24;
}
export function measuredLength(arrow,scale) {
  if(!validScale(scale)) throw new RangeError('Invalid image scale');
  return Math.hypot(arrow.x2-arrow.x1,arrow.y2-arrow.y1) * scale.real / pixelsPerReference(scale);
}
export function formatValue(value) {
  if(value !== 0 && (Math.abs(value) < 0.0001 || Math.abs(value) >= 1e12)) return value.toExponential(3).replace('.',',');
  return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:4,useGrouping:false}).format(value);
}
export function measurementLabel(arrow,scale) { return formatValue(measuredLength(arrow,scale)) + ' ' + scale.unit; }

// Export the displayed labels, including manual edits, without recalculating lengths.
export function measurementsCsv(arrows,scale) {
  return arrows.map((arrow,index)=>{
    let label=String(arrow.label ?? '').trim().replaceAll('−','-');
    const unit=scale?.unit?.trim();
    if(unit && label.endsWith(unit))label=label.slice(0,-unit.length).trim();
    // Accept spaced thousands, decimal comma or point, and scientific notation.
    label=label.replace(/(\d)[ \u00a0\u202f](?=\d{3}(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?(?:\D|$))/g,'$1');
    const numbers=label.match(/[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:[eE][+-]?\d+)?/g);
    if(!numbers || numbers.length!==1 || !Number.isFinite(Number(numbers[0].replace(',','.'))))throw new RangeError('В подписи стрелки '+(index+1)+' должно быть одно числовое значение.');
    return numbers[0].replace(',','.');
  }).join('\r\n')+(arrows.length?'\r\n':'');
}
