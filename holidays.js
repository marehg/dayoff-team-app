/* Georgian statutory public holidays + company-specific New Year break.
 * Dates are calculated locally; Easter uses Julian Paschalion converted to Gregorian.
 * Review extraordinary government-declared days off separately each year.
 */
(function(root){
  'use strict';
  const fixed = [
    [1,1,'New Year’s Day'],[1,2,'New Year holiday'],
    [1,7,'Orthodox Christmas'],[1,19,'Epiphany'],
    [3,3,'Mother’s Day'],[3,8,'International Women’s Day'],
    [4,9,'National Unity Day'],[5,9,'Victory Day'],
    [5,12,'St Andrew the First-Called Day'],[5,17,'Family Purity Day'],
    [5,26,'Independence Day'],[8,28,'Mariamoba'],
    [10,14,'Svetitskhovloba'],[11,23,'St George’s Day']
  ];
  const iso=(y,m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  function easterSunday(year){
    // Julian calendar Easter, converted to the civil Gregorian calendar.
    const a=year%4,b=year%7,c=year%19,d=(19*c+15)%30,e=(2*a+4*b-d+34)%7;
    const julianMonth=Math.floor((d+e+114)/31),julianDay=(d+e+114)%31+1;
    const calendarOffset=Math.floor(year/100)-Math.floor(year/400)-2;
    return new Date(Date.UTC(year,julianMonth-1,julianDay+calendarOffset));
  }
  function holidayMap(year){
    const result=new Map();
    const add=(date,name,kind='public')=>result.set(date,{name,kind});
    fixed.forEach(([m,d,name])=>add(iso(year,m,d),name));
    const easter=easterSunday(year);
    [-2,-1,0,1].forEach((offset,index)=>{
      const dt=new Date(easter);dt.setUTCDate(dt.getUTCDate()+offset);
      add(iso(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate()),['Good Friday','Holy Saturday','Orthodox Easter','Easter Monday'][index]);
    });
    // Additional company-specific time off, not statutory Georgia public holidays.
    add(iso(year,1,3),'Company New Year holiday','company');
    add(iso(year,12,31),'Company New Year holiday','company');
    return result;
  }
  const cache=new Map();
  function on(date){const year=Number(date.slice(0,4));if(!cache.has(year))cache.set(year,holidayMap(year));return cache.get(year).get(date)||null;}
  function workdays(start,end){
    if(!start||!end||end<start)return 0;
    const first=new Date(start+'T12:00:00'),last=new Date(end+'T12:00:00');
    if(!Number.isFinite(first.getTime())||!Number.isFinite(last.getTime()))return 0;
    let count=0;
    for(let d=first;d<=last;d.setDate(d.getDate()+1)){
      const key=iso(d.getFullYear(),d.getMonth()+1,d.getDate());
      if(d.getDay()!==0&&d.getDay()!==6&&!on(key))count++;
    }
    return count;
  }
  const api={on,workdays,holidayMap,easterSunday};
  root.DayoffHolidays=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
