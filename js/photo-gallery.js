(function(){'use strict';
let current=null;
function open({title='Galeria de fotos',images=[],index=0}={}){
 const entries=images.filter(x=>x&&typeof x.url==='string'&&/^https?:\/\//i.test(x.url));if(!entries.length)throw Error('Nenhuma foto disponível.');
 close();const previous=document.activeElement;let position=Math.max(0,Math.min(index,entries.length-1));
 const modal=document.createElement('div');modal.id='ccs-photo-modal';modal.className='ccs-photo-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',title);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 modal.innerHTML='<section class="ccs-photo-dialog"><div class="ccs-photo-head"><strong>'+esc(title)+'</strong><button type="button" data-gallery="close" aria-label="Fechar galeria">✕ Fechar</button></div><div class="ccs-photo-stage"><button type="button" data-gallery="prev" aria-label="Foto anterior">‹</button><figure><img data-gallery-image alt=""><figcaption data-gallery-caption></figcaption></figure><button type="button" data-gallery="next" aria-label="Próxima foto">›</button></div><div class="ccs-photo-thumbs"></div></section>';
 document.body.appendChild(modal);const photo=modal.querySelector('[data-gallery-image]'),caption=modal.querySelector('[data-gallery-caption]'),thumbs=modal.querySelector('.ccs-photo-thumbs');
 thumbs.innerHTML=entries.map((img,i)=>'<button type="button" data-gallery-index="'+i+'" aria-label="Visualizar '+esc(img.label||'Foto '+(i+1))+'"><img src="'+esc(img.url)+'" alt=""><span>'+esc(img.label||'Foto '+(i+1))+'</span></button>').join('');
 function show(i){position=(i+entries.length)%entries.length;photo.src=entries[position].url;photo.alt=entries[position].label||'Foto';caption.textContent=(entries[position].label||'Foto')+' · '+(position+1)+' de '+entries.length;thumbs.querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-pressed',String(j===position)))}
 function key(e){if(e.key==='Escape'){e.preventDefault();close()}else if(e.key==='ArrowLeft'){e.preventDefault();show(position-1)}else if(e.key==='ArrowRight'){e.preventDefault();show(position+1)}else if(e.key==='Tab'){const controls=[...modal.querySelectorAll('button:not(:disabled)')];const i=controls.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();controls.at(-1).focus()}else if(!e.shiftKey&&i===controls.length-1){e.preventDefault();controls[0].focus()}}}
 current={modal,key,previous};document.addEventListener('keydown',key);
 modal.addEventListener('click',e=>{if(e.target===modal)return close();const b=e.target.closest('[data-gallery]');if(!b)return;if(b.dataset.gallery==='close')close();if(b.dataset.gallery==='prev')show(position-1);if(b.dataset.gallery==='next')show(position+1);});
 thumbs.querySelectorAll('button').forEach(b=>b.onclick=()=>show(Number(b.dataset.galleryIndex)));
 show(position);modal.querySelector('[data-gallery="close"]').focus();
}
function close(){if(!current)return;document.removeEventListener('keydown',current.key);current.modal.remove();if(current.previous?.isConnected)current.previous.focus();current=null}
window.CCSPhotoGallery={open,close};
})();