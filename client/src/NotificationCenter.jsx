import {useEffect,useState} from "react";
import "./notifications.css";
const TK="sunshine_admin_token";
async function api(path,t,opt={}){const r=await fetch(path,{...opt,headers:{"Content-Type":"application/json",...(opt.headers||{}),Authorization:`Bearer ${t}`}});const d=await r.json();if(!r.ok)throw Error(d.message||"Request failed");return d}
export default function NotificationCenter(){
 const t=localStorage.getItem(TK),[items,setItems]=useState([]),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [form,setForm]=useState({title:"",message:"",audience:"all",priority:"normal",status:"published",expires_at:"",action_url:""});
 async function load(){try{const d=await api("/api/admin/announcements",t);setItems(d.data||[])}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[]);
 async function publish(e){e.preventDefault();try{await api("/api/admin/announcements",t,{method:"POST",body:JSON.stringify(form)});setNotice("Announcement published and notifications sent.");setForm({...form,title:"",message:""});load()}catch(e){setError(e.message)}}
 async function remove(id){if(!confirm("Delete this announcement?"))return;try{await api(`/api/admin/announcements/${id}`,t,{method:"DELETE"});load()}catch(e){setError(e.message)}}
 return <div className="notify-page"><header className="notify-head"><div><span>COMMUNICATION CENTER</span><h1>Announcements & Notifications</h1><p>Publish school-wide messages and send them to the right audience.</p></div><a href="/admin">← Admin Dashboard</a></header>
 {(error||notice)&&<div className={error?"notify-error":"notify-notice"}>{error||notice}</div>}
 <div className="notify-grid"><form className="notify-card" onSubmit={publish}><span>CREATE ANNOUNCEMENT</span><h2>New Message</h2>
 <label>Title<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Parent Teacher Meeting" required/></label>
 <label>Message<textarea value={form.message} onChange={e=>setForm({...form,message:e.target.value})} required/></label>
 <label>Audience<select value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}><option value="all">Everyone</option><option value="teacher">Teachers</option><option value="student">Students</option><option value="parent">Parents</option><option value="admin">Admins</option></select></label>
 <label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
 <label>Expiry Date<input type="date" value={form.expires_at} onChange={e=>setForm({...form,expires_at:e.target.value})}/></label>
 <label>Action URL<input value={form.action_url} onChange={e=>setForm({...form,action_url:e.target.value})} placeholder="/student/homework"/></label>
 <button>Publish & Notify</button></form>
 <section className="notify-card"><div className="notify-section-head"><div><span>MESSAGE HISTORY</span><h2>Announcements</h2></div><b>{items.length}</b></div>
 {items.map(a=><article className="announcement-row" key={a.id}><div><div className="ann-meta">{a.audience} · {a.priority}</div><h3>{a.title}</h3><p>{a.message}</p><small>{new Date(a.publish_at).toLocaleString()}</small></div><button onClick={()=>remove(a.id)}>Delete</button></article>)}
 {!items.length&&<p className="notify-empty">No announcements yet.</p>}</section></div></div>
}
