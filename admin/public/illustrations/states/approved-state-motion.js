(()=>{
    const root=document.getElementById('upstart-motion-preview');
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const ease='cubic-bezier(.22,1,.36,1)';
    const runs=new Map();
    const invoiceSvg=root.querySelector('[data-state="invoice"] .up-art svg');
    const ns='http://www.w3.org/2000/svg';
    const defs=document.createElementNS(ns,'defs');
    defs.innerHTML='<clipPath id="up-invoice-tray-mask" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="320" height="185"/></clipPath>';
    invoiceSvg.prepend(defs);
    for(const name of ['invoice-sheet','back-sheet']){
      const sheet=invoiceSvg.querySelector('[data-part="'+name+'"]');
      const mask=document.createElementNS(ns,'g');
      mask.setAttribute('clip-path','url(#up-invoice-tray-mask)');
      sheet.before(mask);mask.append(sheet);
    }
    function part(scope,name){return scope.querySelector('[data-part="'+name+'"]')}
    function play(section){
      for(const a of runs.get(section)||[])a.cancel();
      const animations=[];runs.set(section,animations);
      if(reduced.matches)return;
      const large=section.querySelector('.up-art svg');
      const small=section.querySelector('.up-small svg');
      function animate(el,frames,duration,delay=0,origin='center'){
        if(!el)return;
        el.style.transformBox='fill-box';el.style.transformOrigin=origin;
        animations.push(el.animate(frames,{duration:duration*(section.dataset.state==='invoice'?.8:1.8),delay:delay*(section.dataset.state==='invoice'?.8:1.8),easing:ease,fill:'both'}));
      }
      function move(name,frames,duration,delay=0,origin){
        const node=part(large,name);if(!node)return;
        let wrapper=node.parentNode;
        if(!wrapper.hasAttribute('data-motion-wrapper')){
          wrapper=document.createElementNS('http://www.w3.org/2000/svg','g');
          wrapper.setAttribute('data-motion-wrapper','');node.before(wrapper);wrapper.append(node);
        }
        animate(wrapper,frames,duration,delay,origin);
      }
      function draw(scope,name,duration,delay){
        const path=part(scope,name);if(!path)return;
        const length=path.getTotalLength();path.style.strokeDasharray=String(length);
        animate(path,[{strokeDashoffset:length,opacity:0},{strokeDashoffset:0,opacity:1}],duration,delay);
      }
      const kind=section.dataset.state;
      if(kind==='invoice'){
        move('backdrop',[{opacity:0},{opacity:1}],450);
        for(const name of ['tray-back','tray-front'])move(name,[{opacity:0},{opacity:1}],300);
        move('back-sheet',[{transform:'translateY(128px)'},{transform:'translateY(0px)'}],1050,200);
        move('invoice-sheet',[{transform:'translateY(145px)'},{transform:'translateY(0px)'}],1150,350);
        const sheet=part(large,'invoice-sheet');
        function write(el,start,duration=300){
          animate(el,[{transform:'scaleX(0)',opacity:0},{transform:'scaleX(1)',opacity:1}],duration,start,'left center');
        }
        [...part(large,'invoice-header').children].forEach((el,i)=>write(el,1400+i*260,380));
        const dividers=[...sheet.children].filter(el=>el.tagName.toLowerCase()==='path'&&!el.hasAttribute('data-part')&&el.getAttribute('fill')!=='white');
        dividers.forEach((el,i)=>{
          const length=el.getTotalLength();el.style.strokeDasharray=String(length);
          animate(el,[{strokeDashoffset:length,opacity:0},{strokeDashoffset:0,opacity:1}],330,i?2910:1920);
        });
        [...part(large,'invoice-rows').children].forEach((el,i)=>{
          const row=Math.floor(i/3),col=i%3;
          write(el,2100+row*280+col*95,col===0?170:290);
        });
        write(part(large,'invoice-total'),3190,420);
        move('sprig',[{opacity:0,transform:'rotate(-9deg)'},{opacity:1,transform:'rotate(2deg)',offset:.75},{opacity:1,transform:'rotate(0deg)'}],900,500,'95% 100%');
        for(const [name,delay] of [['leaf-top',750],['leaf-bottom',900]])move(name,[{transform:'rotate(-5deg)'},{transform:'rotate(2deg)',offset:.65},{transform:'rotate(0deg)'}],750,delay,'100% 100%');
        [...part(large,'sparkles').children].forEach((el,i)=>animate(el,[{opacity:0,transform:'scale(.2)'},{opacity:1,transform:'scale(1.08)',offset:.75},{opacity:1,transform:'scale(1)'}],550,3330+i*180));
      }else if(kind==='success'){
        move('backdrop',[{opacity:0},{opacity:1}],220);
        move('success-badge',[{opacity:0,transform:'scale(.82)'},{opacity:1,transform:'scale(1.025)',offset:.7},{opacity:1,transform:'scale(1)'}],450,30);
        draw(large,'checkmark',340,160);draw(small,'checkmark',300,130);
        animate(part(small,'badge'),[{opacity:0,transform:'scale(.8)'},{opacity:1,transform:'scale(1)'}],250);
        const sparks=part(large,'success-sparkles');
        [...sparks.children].forEach((el,i)=>animate(el,[{opacity:0,transform:'scale(.2) rotate(-20deg)'},{opacity:1,transform:'scale(1.15) rotate(4deg)',offset:.6},{opacity:1,transform:'scale(1) rotate(0deg)'}],350,300+i*80));
        move('success-dot',[{opacity:0},{opacity:1}],220,250);
      }else{
        move('backdrop',[{opacity:0},{opacity:1}],180);
        move('failure-badge',[{opacity:0,transform:'translateY(5px) scale(.96)'},{opacity:1,transform:'translateY(0) scale(1)'}],280);
        draw(large,'cross-first',160,100);draw(large,'cross-second',160,180);
        draw(small,'cross-first',140,80);draw(small,'cross-second',140,150);
        animate(part(small,'badge'),[{opacity:0},{opacity:1}],180);
        move('failure-accents',[{opacity:0,transform:'translate(-2px,2px)'},{opacity:1,transform:'translate(0,0)'}],200,200);
      }
    }
    root.querySelectorAll('.up-state').forEach(section=>{
      section.querySelector('button').addEventListener('click',()=>play(section));
      setTimeout(()=>play(section),500);
    });
    reduced.addEventListener('change',()=>{if(reduced.matches)for(const list of runs.values())for(const a of list)a.cancel()});
    document.addEventListener('visibilitychange',()=>{for(const list of runs.values())for(const a of list){if(document.hidden)a.pause();else if(a.playState==='paused')a.play()}});
  })();
