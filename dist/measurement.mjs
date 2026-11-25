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

export function measurementColumns(arrows,columnColors=[]) {
  const groups = new Map(columnColors.map(color => [color, []]));
  for(const arrow of arrows){
    if(!groups.has(arrow.color))groups.set(arrow.color, []);
    groups.get(arrow.color).push(arrow);
  }
  return Array.from(groups, ([color, entries]) => ({
    color,
    arrows: entries.sort((a,b) => (a.csvPosition ?? Number.MAX_SAFE_INTEGER) - (b.csvPosition ?? Number.MAX_SAFE_INTEGER))
  })).filter(column => column.arrows.length);
}

export const csvDefaults = Object.freeze({delimiter:',',thousands:'',decimal:'.'});

// The number has already been validated, so format its digits without rounding.
function formatCsvNumber(number,delimiter,thousands,decimal) {
  const [mantissa, exponent = ''] = number.split(/(?=[eE])/);
  const [integer, fraction] = mantissa.split('.');
  const grouped = thousands ? integer.replace(/\B(?=(?:\d{3})+(?!\d))/g, () => thousands) : integer;
  const formatted = grouped + (fraction === undefined ? '' : decimal + fraction) + exponent;
  return formatted.includes(delimiter) ? `"${formatted}"` : formatted;
}

// Export the displayed labels, including manual edits, without recalculating lengths.
export function measurementsCsv(arrows,scale,columnColors=[],options=csvDefaults) {
  const {delimiter=csvDefaults.delimiter,thousands=csvDefaults.thousands,decimal=csvDefaults.decimal} = options;
  const columns = measurementColumns(arrows,columnColors);
  const unit = scale?.unit?.trim();
  const height = columns.reduce((max,column) => Math.max(max,column.arrows.length), 0);
  const values = columns.map((column,columnIndex) => column.arrows.map((arrow,rowIndex) => {
    let label=String(arrow.label ?? '').trim().replaceAll('−','-');
    if(unit && label.endsWith(unit))label=label.slice(0,-unit.length).trim();
    // Accept spaced thousands, decimal comma or point, and scientific notation.
    label=label.replace(/(\d)[ \u00a0\u202f](?=\d{3}(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?(?:\D|$))/g,'$1');
    const numbers=label.match(/[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:[eE][+-]?\d+)?/g);
    const number = numbers?.length === 1 ? numbers[0].replace(',','.') : '';
    if(!number || !Number.isFinite(Number(number))){
      const position = columns.length === 1 ? `стрелки ${rowIndex+1}` : `стрелки в колонке ${columnIndex+1}, строке ${rowIndex+1}`;
      throw new RangeError(`В подписи ${position} должно быть одно числовое значение.`);
    }
    return formatCsvNumber(number,delimiter,thousands,decimal);
  }));
  let csv = '';
  for(let row=0;row<height;row++)csv += values.map(column => column[row] ?? '').join(delimiter) + '\r\n';
  return csv;
}
