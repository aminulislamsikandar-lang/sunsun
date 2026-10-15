import {useEffect,useState} from "react";
import "./academic-management.css";

const TOKEN_KEY="sunshine_admin_token";
async function api(path,token,options={}){
  const r=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(options.headers||{}),Authorization:`Bearer ${token}`}});
  const d=await r.json();
  if(!r.ok)throw new Error(d.message||"Request failed");
  return d;
}

export default function AcademicManagement(){
  const token=localStorage.getItem(TOKEN_KEY);
  const [tab,setTab]=useState("classes");
  const [classes,setClasses]=useState([]),[sections,setSections]=useState([]),[subjects,setSubjects]=useState([]),[assignments,setAssignments]=useState([]),[teachers,setTeachers]=useState([]);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const [classForm,setClassForm]=useState({name:"",display_order:"",status:"active"});
  const [sectionForm,setSectionForm]=useState({class_id:"",name:"",capacity:50,class_teacher_id:"",status:"active"});
  const [subjectForm,setSubjectForm]=useState({name:"",code:"",status:"active"});
  const [assignmentForm,setAssignmentForm]=useState({section_id:"",subject_id:"",teacher_id:"",status:"active"});

  async function load(){
    try{
      const [c,s,sub,a,t]=await Promise.all([
        api("/api/admin/academic/classes",token),
        api("/api/admin/academic/sections",token),
        api("/api/admin/academic/subjects",token),
        api("/api/admin/academic/assignments",token),
        api("/api/admin/teachers",token).catch(()=>({data:[]}))
      ]);
      setClasses(c.data||[]);setSections(s.data||[]);setSubjects(sub.data||[]);setAssignments(a.data||[]);setTeachers(t.data||[]);
    }catch(e){setError(e.message)}
  }
  useEffect(()=>{load()},[]);

  async function create(path,body,label){
    setError("");setNotice("");
    try{await api(path,token,{method:"POST",body:JSON.stringify(body)});setNotice(`${label} created successfully.`);await load()}
    catch(e){setError(e.message)}
  }
  async function remove(path,label){
    if(!confirm(`Delete this ${label}?`))return;
    try{await api(path,token,{method:"DELETE"});setNotice(`${label} deleted.`);await load()}
    catch(e){setError(e.message)}
  }

  return <div className="academic-page">
    <header className="academic-head">
      <div><span>ACADEMIC MANAGEMENT</span><h1>Classes, Sections & Subjects</h1><p>Build the academic structure that connects students, teachers and attendance.</p></div>
      <a href="/admin">← Admin Dashboard</a>
    </header>

    {(error||notice)&&<div className={error?"academic-error":"academic-notice"}>{error||notice}</div>}

    <nav className="academic-tabs">
      {[
        ["classes","Classes"],["sections","Sections"],["subjects","Subjects"],["assignments","Teacher Assignments"]
      ].map(([id,label])=><button className={tab===id?"active":""} onClick={()=>setTab(id)} key={id}>{label}</button>)}
    </nav>

    {tab==="classes"&&<section className="academic-layout">
      <form className="academic-form" onSubmit={e=>{e.preventDefault();create("/api/admin/academic/classes",classForm,"Class");setClassForm({name:"",display_order:"",status:"active"})}}>
        <span>ADD CLASS</span><h2>New Class</h2>
        <label>Class Name<input placeholder="e.g. VI" value={classForm.name} onChange={e=>setClassForm({...classForm,name:e.target.value})} required/></label>
        <label>Display Order<input type="number" value={classForm.display_order} onChange={e=>setClassForm({...classForm,display_order:e.target.value})}/></label>
        <button>Add Class</button>
      </form>
      <div className="academic-panel"><div className="panel-title"><div><span>CLASS DIRECTORY</span><h2>Classes</h2></div><b>{classes.length}</b></div>
        {classes.map(c=><div className="academic-row" key={c.id}><div><strong>Class {c.name}</strong><small>{c.section_count||0} sections · Order {c.display_order}</small></div><em className={c.status}>{c.status}</em><button onClick={()=>remove(`/api/admin/academic/classes/${c.id}`,"class")}>Delete</button></div>)}
      </div>
    </section>}

    {tab==="sections"&&<section className="academic-layout">
      <form className="academic-form" onSubmit={e=>{e.preventDefault();create("/api/admin/academic/sections",sectionForm,"Section");setSectionForm({class_id:"",name:"",capacity:50,class_teacher_id:"",status:"active"})}}>
        <span>ADD SECTION</span><h2>New Section</h2>
        <label>Class<select value={sectionForm.class_id} onChange={e=>setSectionForm({...sectionForm,class_id:e.target.value})} required><option value="">Select class</option>{classes.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        <label>Section<input placeholder="A" value={sectionForm.name} onChange={e=>setSectionForm({...sectionForm,name:e.target.value})} required/></label>
        <label>Capacity<input type="number" value={sectionForm.capacity} onChange={e=>setSectionForm({...sectionForm,capacity:e.target.value})}/></label>
        <label>Class Teacher<select value={sectionForm.class_teacher_id} onChange={e=>setSectionForm({...sectionForm,class_teacher_id:e.target.value})}><option value="">Not assigned</option>{teachers.map(t=><option value={t.id} key={t.id}>{t.name||t.full_name||t.email}</option>)}</select></label>
        <button>Add Section</button>
      </form>
      <div className="academic-panel"><div className="panel-title"><div><span>SECTION DIRECTORY</span><h2>Sections</h2></div><b>{sections.length}</b></div>
        {sections.map(s=><div className="academic-row" key={s.id}><div><strong>{s.class_name}-{s.name}</strong><small>{s.student_count||0}/{s.capacity} students · Teacher: {s.class_teacher||"Not assigned"}</small></div><em className={s.status}>{s.status}</em><button onClick={()=>remove(`/api/admin/academic/sections/${s.id}`,"section")}>Delete</button></div>)}
      </div>
    </section>}

    {tab==="subjects"&&<section className="academic-layout">
      <form className="academic-form" onSubmit={e=>{e.preventDefault();create("/api/admin/academic/subjects",subjectForm,"Subject");setSubjectForm({name:"",code:"",status:"active"})}}>
        <span>ADD SUBJECT</span><h2>New Subject</h2>
        <label>Subject Name<input placeholder="Mathematics" value={subjectForm.name} onChange={e=>setSubjectForm({...subjectForm,name:e.target.value})} required/></label>
        <label>Code<input placeholder="MATH" value={subjectForm.code} onChange={e=>setSubjectForm({...subjectForm,code:e.target.value})}/></label>
        <button>Add Subject</button>
      </form>
      <div className="academic-panel"><div className="panel-title"><div><span>SUBJECT DIRECTORY</span><h2>Subjects</h2></div><b>{subjects.length}</b></div>
        {subjects.map(s=><div className="academic-row" key={s.id}><div><strong>{s.name}</strong><small>{s.code||"No code"}</small></div><em className={s.status}>{s.status}</em><button onClick={()=>remove(`/api/admin/academic/subjects/${s.id}`,"subject")}>Delete</button></div>)}
      </div>
    </section>}

    {tab==="assignments"&&<section className="academic-layout">
      <form className="academic-form" onSubmit={e=>{e.preventDefault();create("/api/admin/academic/assignments",assignmentForm,"Assignment");setAssignmentForm({section_id:"",subject_id:"",teacher_id:"",status:"active"})}}>
        <span>ASSIGNMENT</span><h2>Assign Teacher</h2>
        <label>Class & Section<select value={assignmentForm.section_id} onChange={e=>setAssignmentForm({...assignmentForm,section_id:e.target.value})} required><option value="">Select section</option>{sections.map(s=><option value={s.id} key={s.id}>{s.class_name}-{s.name}</option>)}</select></label>
        <label>Subject<select value={assignmentForm.subject_id} onChange={e=>setAssignmentForm({...assignmentForm,subject_id:e.target.value})} required><option value="">Select subject</option>{subjects.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
        <label>Teacher<select value={assignmentForm.teacher_id} onChange={e=>setAssignmentForm({...assignmentForm,teacher_id:e.target.value})} required><option value="">Select teacher</option>{teachers.map(t=><option value={t.id} key={t.id}>{t.name||t.full_name||t.email}</option>)}</select></label>
        <button>Assign Subject</button>
      </form>
      <div className="academic-panel"><div className="panel-title"><div><span>TEACHER ASSIGNMENTS</span><h2>Assignments</h2></div><b>{assignments.length}</b></div>
        {assignments.map(a=><div className="academic-row" key={a.id}><div><strong>{a.class_name}-{a.section_name} · {a.subject_name}</strong><small>{a.teacher_name} {a.subject_code?`· ${a.subject_code}`:""}</small></div><em className={a.status}>{a.status}</em><button onClick={()=>remove(`/api/admin/academic/assignments/${a.id}`,"assignment")}>Delete</button></div>)}
      </div>
    </section>}
  </div>
}
