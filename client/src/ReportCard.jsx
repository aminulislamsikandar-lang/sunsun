import {useEffect,useState} from "react";
import "./examination-management.css";
const TOKEN_KEY="sunshine_admin_token";
export default function ReportCard({studentId,examId}){
 const token=localStorage.getItem(TOKEN_KEY),[data,setData]=useState(null),[error,setError]=useState("");
 useEffect(()=>{if(!studentId||!examId)return;fetch(`/api/admin/students/${studentId}/report-card?exam_id=${examId}`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json()).then(d=>d.success?setData(d.data):setError(d.message||"Unable to load report card")).catch(e=>setError(e.message))},[studentId,examId]);
 if(error)return <div className="exam-error">{error}</div>;
 if(!data)return <div className="report-loading">Loading report card...</div>;
 return <div className="report-card"><header><span>ADARSHA SENIOR SECONDARY SCHOOL</span><h1>REPORT CARD</h1><p>{data.exam?.name} · {data.exam?.academic_session}</p></header>
 <div className="report-student"><b>{data.student.full_name}</b><span>Admission No. {data.student.admission_no||"—"} · Roll {data.student.roll_no||"—"} · Class {data.student.class_name}-{data.student.section}</span></div>
 <div className="report-table"><div className="report-row report-head"><span>Subject</span><span>Maximum</span><span>Obtained</span><span>Grade</span></div>{data.subjects.map(s=><div className="report-row" key={s.id}><span>{s.subject_name}</span><span>{s.max_marks}</span><span>{s.obtained_marks}</span><b>{s.grade}</b></div>)}</div>
 <div className="report-summary"><div><span>Total</span><b>{data.total}/{data.max}</b></div><div><span>Percentage</span><b>{data.percentage}%</b></div><div><span>Grade</span><b>{data.grade}</b></div><div><span>Result</span><b>{data.result}</b></div></div>
 <button onClick={()=>window.print()}>Print Report Card</button></div>
}
