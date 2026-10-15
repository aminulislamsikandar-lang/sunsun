import {useEffect,useMemo,useState} from "react";
import "./timetable.css";
const TK="sunshine_admin_token";
async function api(path,token,opt={}){const r=await fetch(path,{...opt,headers:{"Content-Type":"application/json",...(opt.headers||{}),Authorization:`Bearer ${token}`}});const d=await r.json();if(!r.ok)throw Error(d.message||"Request failed");return d}
const days=[["1","Monday"],["2","Tuesday"],["3","Wednesday"],["4","Thursday"],["5","Friday"],["6","Saturday"]];
export default function TimetableManagement(){
 const token=localStorage.getItem(TK),[entries,setEntries]=useState([]),[sections,setSections]=useState([]),[subjects,setSubjects]=useState([]),[teachers,setTeachers]=useState([]),[periods,setPeriods]=useState([]),[sectionId,setSectionId]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [form,setForm]=useState({section_id:"",subject_id:"",teacher_id:"",day_of_week:"1",period_number:"1",room:""});
 async function load(){try{const [e,s,sub,p,t]=await Promise.all([api("/api/admin/timetable",token),api("/api/admin/academic/sections",token),api("/api/admin/academic/subjects",token),api("/api/admin/timetable/periods",token),api("/api/admin/teachers",token).catch(()=>({data:[]}))]);setEntries(e.data||[]);setSections(s.data||[]);setSubjects(sub.data||[]);setPeriods(p.data||[]);setTeachers(t.data||[])}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[]);
 const visible=useMemo(()=>entries.filter(e=>!sectionId||String(e.section_id)===String(sectionId)),[entries,sectionId]);
 async function add(e){e.preventDefault();try{await api("/api/admin/timetable",token,{method:"POST",body:JSON.stringify(form)});setNotice("Timetable entry added.");load()}catch(e){setError(e.message)}}
 async function del(id){if(!confirm("Delete this timetable entry?"))return;try{await api(`/api/admin/timetable/${id}`,token,{method:"DELETE"});load()}catch(e){setError(e.message)}}
 return <div className="tt-page"><header className="tt-head"><div><span>TIMETABLE MANAGEMENT</span><h1>School Routine</h1><p>Create a complete weekly routine for every class and section.</p></div><a href="/admin">← Admin Dashboard</a></header>
 {(error||notice)&&<div className={error?"tt-error":"tt-notice"}>{error||notice}</div>}
 <div className="tt-layout"><form className="tt-form" onSubmit={add}><span>ADD PERIOD</span><h2>Schedule Class</h2>
 <label>Class & Section<select value={form.section_id} onChange={e=>setForm({...form,section_id:e.target.value})} required><option value="">Select</option>{sections.map(s=><option key={s.id} value={s.id}>{s.class_name}-{s.name}</option>)}</select></label>
 <label>Subject<select value={form.subject_id} onChange={e=>setForm({...form,subject_id:e.target.value})} required><option value="">Select</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <label>Teacher<select value={form.teacher_id} onChange={e=>setForm({...form,teacher_id:e.target.value})} required><option value="">Select</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name||t.full_name||t.email}</option>)}</select></label>
 <label>Day<select value={form.day_of_week} onChange={e=>setForm({...form,day_of_week:e.target.value})}>{days.map(d=><option key={d[0]} value={d[0]}>{d[1]}</option>)}</select></label>
 <label>Period<select value={form.period_number} onChange={e=>setForm({...form,period_number:e.target.value})}>{periods.map(p=><option key={p.period_number} value={p.period_number}>{p.label} · {p.start_time}-{p.end_time}</option>)}</select></label>
 <label>Room<input placeholder="Room 101" value={form.room} onChange={e=>setForm({...form,room:e.target.value})}/></label><button>Add to Routine</button></form>
 <section className="tt-panel"><div className="tt-panel-head"><div><span>WEEKLY ROUTINE</span><h2>Timetable</h2></div><select value={sectionId} onChange={e=>setSectionId(e.target.value)}><option value="">All Classes</option>{sections.map(s=><option key={s.id} value={s.id}>{s.class_name}-{s.name}</option>)}</select></div>
 <div className="week">{days.map(([id,name])=><div className="day" key={id}><h3>{name}</h3>{visible.filter(e=>String(e.day_of_week)===id).sort((a,b)=>a.period_number-b.period_number).map(e=><article key={e.id}><small>{e.start_time||e.period_label||`Period ${e.period_number}`}</small><b>{e.subject_name}</b><span>{e.class_name}-{e.section_name} · {e.teacher_name}</span>{e.room&&<i>{e.room}</i>}<button onClick={()=>del(e.id)}>×</button></article>)}{!visible.some(e=>String(e.day_of_week)===id)&&<p className="empty-day">No classes</p>}</div>)}</div>
 </section></div></div>
}
