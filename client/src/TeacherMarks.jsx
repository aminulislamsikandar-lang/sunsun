import {useEffect,useState} from "react";
import "./examination-management.css";
const TOKEN_KEY="sunshine_teacher_token";
async function api(path,token,options={}){const r=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(options.headers||{}),Authorization:`Bearer ${token}`}});const d=await r.json();if(!r.ok)throw new Error(d.message||"Request failed");return d}
export default function TeacherMarks(){
 const token=localStorage.getItem(TOKEN_KEY),[exams,setExams]=useState([]),[subjects,setSubjects]=useState([]),[selected,setSelected]=useState(null),[students,setStudents]=useState([]),[marks,setMarks]=useState({}),[error,setError]=useState(""),[notice,setNotice]=useState("");
 useEffect(()=>{api("/api/teacher/exams",token).then(d=>setExams(d.data||[])).catch(e=>setError(e.message))},[]);
 async function selectExam(e){setSelected(e);try{const d=await api(`/api/teacher/exams/${e.id}/subjects`,token);setSubjects(d.data||[])}catch(e){setError(e.message)}}
 async function selectSubject(s){setSelected(s);try{const d=await api(`/api/teacher/exam-subjects/${s.id}/students`,token);setStudents(d.data.students||[]);const m={};(d.data.students||[]).forEach(x=>m[x.id]=x.obtained_marks??0);setMarks(m)}catch(e){setError(e.message)}}
 async function save(){if(!selected||!students.length)return;try{await api(`/api/teacher/exam-subjects/${selected.id}/marks`,token,{method:"POST",body:JSON.stringify({marks:students.map(s=>({student_id:s.id,obtained_marks:Number(marks[s.id]||0)}))})});setNotice("Marks saved successfully.")}catch(e){setError(e.message)}}
 return <div className="marks-page"><header className="exam-head"><div><span>TEACHER PORTAL</span><h1>Marks Entry</h1><p>Select an examination and enter marks for your assigned subject.</p></div><a href="/teacher">← Teacher Dashboard</a></header>
 {(error||notice)&&<div className={error?"exam-error":"exam-notice"}>{error||notice}</div>}
 <div className="marks-steps"><section><span>1 · EXAM</span>{exams.map(e=><button className={selected?.id===e.id?"active":""} key={e.id} onClick={()=>selectExam(e)}>{e.name}<small>{e.academic_session}</small></button>)}</section>
 <section><span>2 · SUBJECT</span>{subjects.map(s=><button className={selected?.id===s.id?"active":""} key={s.id} onClick={()=>selectSubject(s)}>{s.class_name}-{s.section_name}<small>{s.subject_name} · Max {s.max_marks}</small></button>)}</section></div>
 {students.length>0&&<section className="marks-panel"><div className="exam-panel-head"><div><span>MARKS ENTRY</span><h2>{selected.subject_name}</h2></div><button onClick={save}>Save Marks</button></div>
 <div className="marks-table"><div className="marks-head"><span>Roll</span><span>Student</span><span>Admission No.</span><span>Marks / {selected.max_marks}</span></div>
 {students.map(s=><div className="marks-row" key={s.id}><span>{s.roll_no||"—"}</span><b>{s.full_name}</b><span>{s.admission_no||"—"}</span><input type="number" min="0" max={selected.max_marks} value={marks[s.id]??0} onChange={e=>setMarks({...marks,[s.id]:e.target.value})}/></div>)}</div></section>}
 </div>
}
