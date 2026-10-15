import {useEffect,useMemo,useState} from "react";
import "./calendar.css";
const TK="sunshine_admin_token";
async function api(p,t,o={}){const r=await fetch(p,{...o,headers:{"Content-Type":"application/json",...(o.headers||{}),Authorization:`Bearer ${t}`}});const d=await r.json();if(!r.ok)throw Error(d.message||"Request failed");return d}
const types=["event","holiday","exam","meeting","competition","admission","activity"];
export default function CalendarEvents(){
 const t=localStorage.getItem(TK),[events,setEvents]=useState([]),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [form,setForm]=useState({title:"",description:"",event_type:"event",start_date:new Date().toISOString().slice(0,10),start_time:"",end_date:"",end_time:"",location:"",audience:"all",priority:"normal",color:""});
 async function load(){try{setEvents((await api("/api/admin/events",t)).data||[])}catch(e){setError(e.message)}} useEffect(()=>{load()},[]);
 async function save(e){e.preventDefault();try{await api("/api/admin/events",t,{method:"POST",body:JSON.stringify(form)});setNotice("Event created.");setForm({...form,title:"",description:"",location:""});load()}catch(e){setError(e.message)}}
 async function del(id){if(!confirm("Delete this event?"))return;try{await api(`/api/admin/events/${id}`,t,{method:"DELETE"});load()}catch(e){setError(e.message)}}
 const grouped=useMemo(()=>events.reduce((a,e)=>{(a[e.start_date]??=[]).push(e);return a},{}),[events]);
 return <div className="calendar-page"><header className="calendar-head"><div><span>SCHOOL CALENDAR</span><h1>Events & Calendar</h1><p>Manage holidays, exams, meetings, competitions and school events.</p></div><a href="/admin">← Admin Dashboard</a></header>
 {(error||notice)&&<div className={error?"cal-error":"cal-notice"}>{error||notice}</div>}
 <div className="calendar-grid"><form className="cal-card" onSubmit={save}><span>CREATE EVENT</span><h2>New Calendar Entry</h2>
 <label>Title<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Annual Sports Day" required/></label>
 <label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
 <div className="cal-two"><label>Type<select value={form.event_type} onChange={e=>setForm({...form,event_type:e.target.value})}>{types.map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Audience<select value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}><option value="all">Everyone</option><option value="teacher">Teachers</option><option value="student">Students</option><option value="parent">Parents</option></select></label></div>
 <div className="cal-two"><label>Start Date<input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/></label><label>Start Time<input type="time" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})}/></label></div>
 <div className="cal-two"><label>End Date<input type="date" value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})}/></label><label>End Time<input type="time" value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})}/></label></div>
 <label>Location<input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="School Auditorium"/></label>
 <label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>normal</option><option>high</option><option>urgent</option></select></label>
 <button>Create Event</button></form>
 <section className="cal-card"><div className="cal-title"><div><span>UPCOMING</span><h2>School Calendar</h2></div><b>{events.length}</b></div>
 {Object.entries(grouped).map(([date,list])=><div className="cal-day" key={date}><h3>{new Date(date+"T00:00:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</h3>{list.map(e=><article className="event-row" key={e.id}><div className="event-dot"/><div><b>{e.title}</b><small>{e.event_type} · {e.start_time||"All day"}{e.location?` · ${e.location}`:""}</small><p>{e.description}</p></div><button onClick={()=>del(e.id)}>Delete</button></article>)}</div>)}
 {!events.length&&<p className="cal-empty">No events scheduled.</p>}</section></div></div>
}
