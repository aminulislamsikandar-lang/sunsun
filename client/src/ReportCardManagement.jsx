import {useEffect,useState} from "react";
import "./report-card.css";
const TK="sunshine_admin_token";
async function api(p,t,o={}){const r=await fetch(p,{...o,headers:{"Content-Type":"application/json",...(o.headers||{}),Authorization:`Bearer ${t}`}});const d=await r.json();if(!r.ok)throw Error(d.message||"Request failed");return d}
const blank={subject_name:"",max_marks:100,obtained_marks:0,teacher_remarks:""};
export default function ReportCardManagement(){
 const t=localStorage.getItem(TK),[students,setStudents]=useState([]),[cards,setCards]=useState([]),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [form,setForm]=useState({student_id:"",academic_year:"2026-27",term:"Term 1",exam_name:"First Term Examination",rank:"",remarks:"",attendance_percentage:"",published:false,subjects:[{...blank}]});
 async function load(){try{const [s,c]=await Promise.all([api("/api/admin/hostel/students",t),api("/api/admin/report-cards",t)]);setStudents(s.data||[]);setCards(c.data||[])}catch(e){setError(e.message)}} useEffect(()=>{load()},[]);
 function subject(i,k,v){setForm(f=>({...f,subjects:f.subjects.map((x,j)=>j===i?{...x,[k]:v}:x)}))}
 function add(){setForm(f=>({...f,subjects:[...f.subjects,{...blank}]}))}
 function remove(i){setForm(f=>({...f,subjects:f.subjects.filter((_,j)=>j!==i)}))}
 const totals=form.subjects.reduce((a,x)=>({max:a.max+(Number(x.max_marks)||0),got:a.got+(Number(x.obtained_marks)||0)}),{max:0,got:0});
 const percentage=totals.max?((totals.got/totals.max)*100).toFixed(2):"0.00";
 async function save(e){e.preventDefault();try{await api("/api/admin/report-cards",t,{method:"POST",body:JSON.stringify(form)});setNotice("Report card created.");load()}catch(e){setError(e.message)}}
 async function publish(id){try{await api(`/api/admin/report-cards/${id}/publish`,t,{method:"POST"});setNotice("Report card published.");load()}catch(e){setError(e.message)}}
 async function del(id){if(!confirm("Delete this report card?"))return;try{await api(`/api/admin/report-cards/${id}`,t,{method:"DELETE"});load()}catch(e){setError(e.message)}}
 return <div className="report-page"><header className="report-head"><div><span>ACADEMIC PERFORMANCE</span><h1>Report Cards & Results</h1><p>Create, edit, publish and manage final student results.</p></div><a href="/admin">← Admin Dashboard</a></header>
 {(error||notice)&&<div className={error?"report-error":"report-notice"}>{error||notice}</div>}
 <div className="report-grid"><form className="report-card" onSubmit={save}><span>CREATE RESULT</span><h2>New Report Card</h2>
 <label>Student<select value={form.student_id} onChange={e=>setForm({...form,student_id:e.target.value})} required><option value="">Select student</option>{students.map(s=><option key={s.id} value={s.id}>{s.full_name} · {s.class_name}-{s.section} · {s.admission_no}</option>)}</select></label>
 <div className="report-two"><label>Academic Year<input value={form.academic_year} onChange={e=>setForm({...form,academic_year:e.target.value})}/></label><label>Term<input value={form.term} onChange={e=>setForm({...form,term:e.target.value})}/></label></div>
 <label>Exam Name<input value={form.exam_name} onChange={e=>setForm({...form,exam_name:e.target.value})}/></label>
 <div className="subject-head"><b>Subjects</b><button type="button" onClick={add}>+ Add Subject</button></div>
 {form.subjects.map((x,i)=><div className="subject-box" key={i}><input placeholder="Subject name" value={x.subject_name} onChange={e=>subject(i,"subject_name",e.target.value)}/><input type="number" placeholder="Max" value={x.max_marks} onChange={e=>subject(i,"max_marks",e.target.value)}/><input type="number" placeholder="Obtained" value={x.obtained_marks} onChange={e=>subject(i,"obtained_marks",e.target.value)}/>{form.subjects.length>1&&<button type="button" onClick={()=>remove(i)}>×</button>}</div>)}
 <div className="result-summary"><span>Final Percentage</span><strong>{percentage}%</strong></div>
 <div className="report-two"><label>Rank<input type="number" min="1" value={form.rank} onChange={e=>setForm({...form,rank:e.target.value})}/></label><label>Attendance %<input type="number" min="0" max="100" value={form.attendance_percentage} onChange={e=>setForm({...form,attendance_percentage:e.target.value})}/></label></div>
 <label>Remarks<textarea value={form.remarks} onChange={e=>setForm({...form,remarks:e.target.value})}/></label><button className="primary">Create Report Card</button></form>
 <section className="report-card"><div className="report-list-head"><div><span>RESULT DIRECTORY</span><h2>Student Results</h2></div><b>{cards.length}</b></div>{cards.map(c=><article className="result-row" key={c.id}><div><strong>{c.full_name}</strong><small>{c.class_name}-{c.section} · {c.exam_name} · {c.term}</small><div><em>{Number(c.percentage).toFixed(2)}%</em><i>{c.grade}</i><mark className={c.result==="Pass"?"pass":"fail"}>{c.result}</mark>{c.published?null:<mark className="draft">DRAFT</mark>}</div></div><div className="result-actions">{!c.published&&<button onClick={()=>publish(c.id)}>Publish</button>}<button onClick={()=>del(c.id)}>Delete</button></div></article>)}{!cards.length&&<p className="report-empty">No report cards yet.</p>}</section></div></div>
}
