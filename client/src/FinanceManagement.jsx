import {useEffect,useState} from "react";import "./finance.css";
const TK="sunshine_admin_token";async function api(path,t,opt={}){const r=await fetch(path,{...opt,headers:{"Content-Type":"application/json",...(opt.headers||{}),Authorization:`Bearer ${t}`}});const d=await r.json();if(!r.ok)throw Error(d.message||"Request failed");return d}
export default function FinanceManagement(){
 const t=localStorage.getItem(TK),[dash,setDash]=useState({}),[structures,setStructures]=useState([]),[students,setStudents]=useState([]),[assignments,setAssignments]=useState([]),[payments,setPayments]=useState([]),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [fee,setFee]=useState({name:"",academic_session:"2026-27",class_name:"",section:"",frequency:"annual",amount:"",due_date:""});
 const [assign,setAssign]=useState({student_id:"",fee_structure_id:"",amount:"",discount:0,due_date:""}),[pay,setPay]=useState({student_id:"",fee_assignment_id:"",amount:"",payment_method:"cash",transaction_ref:"",paid_on:new Date().toISOString().slice(0,10),remarks:""});
 async function load(){try{const [d,f,s,a,p]=await Promise.all([api("/api/admin/fees/dashboard",t),api("/api/admin/fees/structures",t),api("/api/admin/fees/students",t),api("/api/admin/fees/assignments",t),api("/api/admin/fees/payments",t)]);setDash(d.data||{});setStructures(f.data||[]);setStudents(s.data||[]);setAssignments(a.data||[]);setPayments(p.data||[])}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[]);
 async function post(path,body,msg){try{await api(path,t,{method:"POST",body:JSON.stringify(body)});setNotice(msg);load()}catch(e){setError(e.message)}}
 return <div className="finance-page"><header className="finance-head"><div><span>FEES & FINANCE</span><h1>School Finance</h1><p>Manage fee structures, student dues, payments and receipts.</p></div><a href="/admin">← Admin Dashboard</a></header>
 {(error||notice)&&<div className={error?"fin-error":"fin-notice"}>{error||notice}</div>}
 <div className="fin-stats"><div><span>ASSIGNED</span><b>₹{Number(dash.assigned||0).toLocaleString()}</b></div><div><span>COLLECTED</span><b>₹{Number(dash.collected||0).toLocaleString()}</b></div><div><span>OUTSTANDING</span><b>₹{Number(dash.outstanding||0).toLocaleString()}</b></div><div><span>STUDENTS</span><b>{dash.students||0}</b></div></div>
 <div className="fin-grid">
  <form className="fin-card" onSubmit={e=>{e.preventDefault();post("/api/admin/fees/structures",fee,"Fee structure created.")}}><span>FEE STRUCTURE</span><h2>Create Fee</h2>
   <label>Name<input placeholder="Annual Tuition Fee" value={fee.name} onChange={e=>setFee({...fee,name:e.target.value})} required/></label>
   <label>Session<input value={fee.academic_session} onChange={e=>setFee({...fee,academic_session:e.target.value})}/></label>
   <label>Class<input placeholder="VII (optional)" value={fee.class_name} onChange={e=>setFee({...fee,class_name:e.target.value})}/></label>
   <label>Frequency<select value={fee.frequency} onChange={e=>setFee({...fee,frequency:e.target.value})}><option value="annual">Annual</option><option value="monthly">Monthly</option><option value="term">Term</option><option value="one-time">One-time</option></select></label>
   <label>Amount<input type="number" min="0" value={fee.amount} onChange={e=>setFee({...fee,amount:e.target.value})} required/></label><label>Due Date<input type="date" value={fee.due_date} onChange={e=>setFee({...fee,due_date:e.target.value})}/></label>
   <button>Create Fee Structure</button>
  </form>
  <section className="fin-card"><span>FEE CATALOG</span><h2>Structures</h2>{structures.map(f=><div className="fin-row" key={f.id}><div><b>{f.name}</b><small>{f.class_name||"All classes"} · {f.frequency}</small></div><strong>₹{Number(f.amount).toLocaleString()}</strong></div>)}</section>
 </div>
 <div className="fin-grid">
  <form className="fin-card" onSubmit={e=>{e.preventDefault();post("/api/admin/fees/assignments",assign,"Fee assigned to student.")}}><span>STUDENT BILLING</span><h2>Assign Fee</h2>
   <label>Student<select value={assign.student_id} onChange={e=>setAssign({...assign,student_id:e.target.value})} required><option value="">Select student</option>{students.map(s=><option key={s.id} value={s.id}>{s.full_name} · {s.class_name}-{s.section}</option>)}</select></label>
   <label>Fee<select value={assign.fee_structure_id} onChange={e=>setAssign({...assign,fee_structure_id:e.target.value})} required><option value="">Select fee</option>{structures.map(f=><option key={f.id} value={f.id}>{f.name} · ₹{f.amount}</option>)}</select></label>
   <label>Amount<input type="number" value={assign.amount} onChange={e=>setAssign({...assign,amount:e.target.value})} placeholder="Leave blank for catalog amount"/></label>
   <label>Discount<input type="number" min="0" value={assign.discount} onChange={e=>setAssign({...assign,discount:e.target.value})}/></label>
   <label>Due Date<input type="date" value={assign.due_date} onChange={e=>setAssign({...assign,due_date:e.target.value})}/></label><button>Assign Fee</button>
  </form>
  <form className="fin-card" onSubmit={e=>{e.preventDefault();post("/api/admin/fees/payments",pay,"Payment recorded and receipt generated.")}}><span>RECEIVE PAYMENT</span><h2>Record Payment</h2>
   <label>Student<select value={pay.student_id} onChange={e=>setPay({...pay,student_id:e.target.value})} required><option value="">Select student</option>{students.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select></label>
   <label>Fee Assignment<select value={pay.fee_assignment_id} onChange={e=>setPay({...pay,fee_assignment_id:e.target.value})}><option value="">General payment</option>{assignments.filter(a=>!pay.student_id||String(a.student_id)===String(pay.student_id)).map(a=><option key={a.id} value={a.id}>{a.fee_name} · Balance ₹{a.balance}</option>)}</select></label>
   <label>Amount<input type="number" min="0.01" value={pay.amount} onChange={e=>setPay({...pay,amount:e.target.value})} required/></label>
   <label>Payment Method<select value={pay.payment_method} onChange={e=>setPay({...pay,payment_method:e.target.value})}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank Transfer</option><option value="card">Card</option><option value="cheque">Cheque</option></select></label>
   <label>Transaction / Reference<input value={pay.transaction_ref} onChange={e=>setPay({...pay,transaction_ref:e.target.value})}/></label><label>Paid On<input type="date" value={pay.paid_on} onChange={e=>setPay({...pay,paid_on:e.target.value})}/></label><button>Record Payment</button>
  </form>
 </div>
 <section className="fin-card fin-wide"><span>RECENT PAYMENTS</span><h2>Payment History</h2>{payments.slice(0,20).map(p=><div className="payment-row" key={p.id}><div><b>{p.full_name}</b><small>{p.receipt_no} · {p.payment_method} · {p.paid_on}</small></div><strong>₹{Number(p.amount).toLocaleString()}</strong></div>)}</section>
 </div>
}
