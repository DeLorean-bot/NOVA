// The optical layer renders behind the interface; it never samples posters or text.
const vertex = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`
const fragment = `precision highp float;
uniform vec2 resolution;
uniform vec3 pointer;
uniform float time;
uniform float lightTheme;
float soft(float x){return x/sqrt(1.+x*x);}
float heightAt(vec2 p){
  float a=p.y+.36*p.x+.36+.19*sin(p.x*.95+time*.055);
  float b=p.y-.44*p.x-.56+.14*cos(p.x*1.2-time*.04);
  float h=.075*soft(a*3.5)+.045*soft(b*4.2);
  vec2 d=p-pointer.xy;
  h+=pointer.z*.055*exp(-dot(d,d)*5.);
  return h;
}
vec3 lightAt(vec2 p){
  float a=p.y+.40*p.x+.30+.18*sin(p.x*.9);
  float b=p.y-.45*p.x-.62+.12*cos(p.x*1.1);
  float broad=exp(-a*a*2.5), narrow=exp(-b*b*6.);
  float silk=pow(.5+.5*sin(p.x*2.5+p.y*.7),6.);
  vec3 dark=vec3(.04313725,.04313725,.05098039)+vec3(.020,.031,.045)*broad+vec3(.028,.025,.022)*narrow+silk*.004;
  vec3 pale=vec3(.96470588,.96862745,.97647059)-vec3(.055,.041,.020)*broad+vec3(.015,.018,.024)*narrow-silk*.005;
  return mix(dark,pale,lightTheme);
}
void main(){
  vec2 p=(gl_FragCoord.xy-.5*resolution)/resolution.y;
  float e=.003, h=heightAt(p);
  vec2 slope=vec2(heightAt(p+vec2(e,0.))-heightAt(p-vec2(e,0.)),heightAt(p+vec2(0.,e))-heightAt(p-vec2(0.,e)))/(2.*e);
  vec3 normal=normalize(vec3(-slope,1.));
  vec3 ray=refract(vec3(0.,0.,-1.),normal,1./1.46);
  vec2 travel=ray.xy*.75;
  vec3 color=lightAt(p+travel)*.6+(lightAt(p+travel+vec2(.012,.009))+lightAt(p+travel-vec2(.012,.009)))*.2;
  float a=p.y+.36*p.x+.36+.19*sin(p.x*.95+time*.055);
  float b=p.y-.44*p.x-.56+.14*cos(p.x*1.2-time*.04);
  float edge=exp(-pow((a-.19)/.015,2.))*.045+exp(-pow((b+.17)/.021,2.))*.027;
  float glow=pow(max(0.,dot(normal,normalize(vec3(-.7,.5,1.6)))),28.);
  float fresnel=pow(1.-max(0.,normal.z),2.);
  color+=mix(vec3(.30,.36,.45),vec3(.65,.73,.84),lightTheme)*(edge+glow*.018+fresnel*.4);
  color+=vec3(lightAt(p+travel*1.025).r-lightAt(p+travel*.975).r,0.,lightAt(p+travel*.975).b-lightAt(p+travel*1.025).b)*.35;
  vec3 base=mix(vec3(.04313725,.04313725,.05098039),vec3(.96470588,.96862745,.97647059),lightTheme);
  // Keep the native Windows caption and perimeter exactly the canvas color.
  float top=resolution.y-gl_FragCoord.y;
  float perimeter=smoothstep(0.,30.,min(gl_FragCoord.x,resolution.x-gl_FragCoord.x))*smoothstep(0.,24.,gl_FragCoord.y)*smoothstep(32.,115.,top);
  gl_FragColor=vec4(mix(base,color,perimeter),1.);
}`

export function createGlassBackdrop(canvas: HTMLCanvasElement, light: boolean, reduced: boolean) {
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power'})
  if(!gl) throw new Error('Glass background is unavailable')
  const shaders: WebGLShader[]=[]
  const compile=(type:number,source:string)=>{const shader=gl.createShader(type)!;shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Glass shader could not compile');return shader}
  const program=gl.createProgram()!
  try { gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Glass shader could not link') }
  catch(error){shaders.forEach(shader=>gl.deleteShader(shader));gl.deleteProgram(program);throw error}
  gl.useProgram(program)
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
  const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0)
  const resolution=gl.getUniformLocation(program,'resolution'),pointer=gl.getUniformLocation(program,'pointer'),time=gl.getUniformLocation(program,'time')
  gl.uniform1f(gl.getUniformLocation(program,'lightTheme'),light?1:0)
  let width=1,height=1,frame=0,timer:ReturnType<typeof setTimeout>|undefined,disposed=false,draws=0,active=0,last=performance.now(),clock=0
  const target={x:0,y:0},current={x:0,y:0}
  const stop=()=>{cancelAnimationFrame(frame);clearTimeout(timer);frame=0;timer=undefined}
  const draw=()=>{
    if(disposed||document.hidden||gl.isContextLost())return
    const now=performance.now(),delta=Math.min(.1,(now-last)/1000);last=now
    if(!reduced){clock+=delta;current.x+=(target.x-current.x)*(1-Math.exp(-delta*5));current.y+=(target.y-current.y)*(1-Math.exp(-delta*5));active*=Math.exp(-delta*.6)}
    gl.uniform2f(resolution,width,height);gl.uniform3f(pointer,current.x,current.y,reduced?0:active);gl.uniform1f(time,reduced?0:clock);gl.drawArrays(gl.TRIANGLES,0,6)
    canvas.dataset.frames=String(++draws);canvas.dataset.state='ready';canvas.dataset.motion=reduced?'still':'running'
    if(!reduced)timer=setTimeout(()=>{frame=requestAnimationFrame(draw)},active>.08?20:45)
  }
  const resize=()=>{if(disposed)return;const box=canvas.getBoundingClientRect(),ratio=Math.min(1,1280/Math.max(box.width,box.height));width=Math.max(1,Math.round(box.width*ratio));height=Math.max(1,Math.round(box.height*ratio));canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);stop();last=performance.now();draw()}
  const move=(event:PointerEvent)=>{if(reduced||event.pointerType==='touch')return;const box=canvas.getBoundingClientRect();target.x=(event.clientX-box.left-box.width/2)/box.height;target.y=(box.height/2-event.clientY+box.top)/box.height;active=.8}
  const leave=()=>{target.x=0;target.y=0;active=Math.min(active,.2)}
  const visibility=()=>{stop();canvas.dataset.motion=document.hidden?'paused':reduced?'still':'running';if(!document.hidden){last=performance.now();draw()}}
  const observer=new ResizeObserver(resize);observer.observe(canvas)
  window.addEventListener('pointermove',move,{passive:true});document.documentElement.addEventListener('pointerleave',leave);document.addEventListener('visibilitychange',visibility)
  resize()
  return ()=>{disposed=true;stop();observer.disconnect();window.removeEventListener('pointermove',move);document.documentElement.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',visibility);gl.deleteBuffer(buffer);gl.deleteProgram(program);shaders.forEach(shader=>gl.deleteShader(shader));gl.getExtension('WEBGL_lose_context')?.loseContext()}
}
