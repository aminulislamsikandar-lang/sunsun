export function requiredString(value,name,max=200){
  const v=String(value??"").trim();
  if(!v) throw new Error(`${name} is required.`);
  if(v.length>max) throw new Error(`${name} is too long.`);
  return v;
}
export function optionalString(value,name,max=5000){
  if(value===undefined||value===null)return "";
  const v=String(value).trim();
  if(v.length>max) throw new Error(`${name} is too long.`);
  return v;
}
export function safeInteger(value,name,min=0,max=2147483647){
  const n=Number(value);
  if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${name} must be a valid integer.`);
  return n;
}
export function safeDecimal(value,name,min=0,max=1000000000){
  const n=Number(value);
  if(!Number.isFinite(n)||n<min||n>max)throw new Error(`${name} must be a valid number.`);
  return n;
}
