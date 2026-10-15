import {useEffect,useMemo,useState} from "react";
import "./calendar.css";
export default function CalendarView({role="student"}){
 const token=localStorage.getItem(`sunshine_${role}_token`),[events,setEvents]=useState([]),[error,setError]=useState("");
 const path=role==="teacher"?"/api/teacher/events":role==="parent"?"/api/parent/events":"/api/student/events";
 useEffect(()=>{fetch(path,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json()).then(d=>d.success?setEvents(d.data||[]):setError(d.message||"Unable to load calendar"))},[]);
 const grouped=useMemo(()=>events.reduce((a,e)=>{(a[e.start_date]??=[]).push(e);return a},{}),[events]);
 return <div className="calendar-page"><header className="calendar-head"><div><span>{role.toUpperCase()} PORTAL</span><h1>School Calendar</h1><p>Upcoming holidays, exams, meetings and school activities.</p></div><a href={`/${role}`}>← Dashboard</a></header>{error&&<div className="cal-error">{error}</div>}<div className="public-calendar">{Object.entries(grouped).map(([date,list])=><div className="public-day" key={date}><h2>{new Date(date+"T00:00:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</h2>{list.map(e=><article className="public-event" key={e.id}><div className="event-type">{e.event_type}</div><div><h3>{e.title}</h3><p>{e.description||"School calendar event."}</p><small>{e.start_time||"All day"}{e.location?` · ${e.location}`:""}</small></div></article>)}</div>)}{!events.length&&<div className="cal-empty">No upcoming events.</div>}</div></div>
}
