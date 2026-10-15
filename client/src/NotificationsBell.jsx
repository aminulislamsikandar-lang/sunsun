import {useEffect,useState} from "react";
import "./notifications.css";
export default function NotificationsBell({role="admin"}){
 const token=localStorage.getItem(`sunshine_${role}_token`),[items,setItems]=useState([]),[open,setOpen]=useState(false);
 const base=role==="admin"?"/api/admin":role==="teacher"?"/api/teacher":role==="student"?"/api/student":"/api/parent";
 async function load(){if(!token)return;const r=await fetch(`${base}/notifications`,{headers:{Authorization:`Bearer ${token}`}});const d=await r.json();if(d.success)setItems(d.data||[])}
 useEffect(()=>{load();const timer=setInterval(load,30000);return()=>clearInterval(timer)},[]);
 const unread=items.filter(x=>!x.is_read).length;
 async function read(id){await fetch(`${base}/notifications/${id}/read`,{method:"PATCH",headers:{Authorization:`Bearer ${token}`}});load()}
 async function readAll(){await fetch(`${base}/notifications/read-all`,{method:"POST",headers:{Authorization:`Bearer ${token}`}});load()}
 return <div className="notification-bell"><button className="bell-btn" onClick={()=>setOpen(!open)}>🔔{unread>0&&<i>{unread>99?"99+":unread}</i>}</button>{open&&<div className="notification-pop"><div className="notification-pop-head"><b>Notifications</b>{unread>0&&<button onClick={readAll}>Mark all read</button>}</div>{items.slice(0,12).map(n=><button className={`notification-item ${n.is_read?"read":""}`} key={n.id} onClick={()=>read(n.id)}><strong>{n.title}</strong><span>{n.message}</span><small>{n.category} · {new Date(n.created_at).toLocaleString()}</small></button>)}{!items.length&&<p>No notifications</p>}</div>}</div>
}
