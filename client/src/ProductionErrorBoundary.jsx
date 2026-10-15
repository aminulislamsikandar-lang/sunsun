import React from"react";
export default class ProductionErrorBoundary extends React.Component{
 constructor(p){super(p);this.state={error:null}}
 static getDerivedStateFromError(error){return{error}}
 componentDidCatch(error,info){try{console.error("[ProductionErrorBoundary]",error,info)}catch{}}
 reset=()=>this.setState({error:null})
 render(){
  if(this.state.error)return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#f4f7fb",fontFamily:"system-ui"}}><div style={{maxWidth:520,padding:28,borderRadius:18,background:"#fff",boxShadow:"0 20px 55px rgba(25,40,60,.1)",textAlign:"center"}}><div style={{fontSize:34}}>⚠️</div><h2>Something went wrong</h2><p style={{color:"#718096"}}>This screen encountered an unexpected error. Your saved data is not intentionally cleared.</p><button onClick={this.reset} style={{border:0,borderRadius:10,padding:"10px 15px",background:"#119b96",color:"#fff",fontWeight:800,cursor:"pointer"}}>Try again</button></div></div>;
  return this.props.children
 }
}
