# Layout illustrations for form Settings -> Layout, in the empty-state style.
INK="#4C1D95"; BLOB="#EDE8FC"; PAPER="#FFFFFF"; ACC="#7C5CE7"; LINE="#C9D4E6"; FIELD="#F6F7FB"; MINT="#BCE5D8"; STAR="#B6A3F1"
def star(x,y,s=1):
    return f'<path transform="translate({x} {y}) scale({s})" d="M0 -7Q1 -1 7 0Q1 1 0 7Q-1 1 -7 0Q-1 -1 0 -7Z" fill="{STAR}" stroke="{INK}" stroke-width="1"/>'
def blob():
    return f'<path d="M30 112C12 94 18 62 38 50C58 38 60 16 92 12C124 8 140 26 160 24C186 22 198 44 196 70C194 96 186 108 176 120C162 138 138 140 112 138C82 136 48 130 30 112Z" fill="{BLOB}"/>'
def paper(x,y,w,h):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{PAPER}" stroke="{INK}" stroke-width="1.5"/>'
def title(x,y,w=40): return f'<path d="M{x} {y}h{w}" stroke="{ACC}" stroke-width="4" stroke-linecap="round"/>'
def label(x,y,w=26): return f'<path d="M{x} {y}h{w}" stroke="{LINE}" stroke-width="2.5" stroke-linecap="round"/>'
def field(x,y,w,h=9): return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2.5" fill="{FIELD}" stroke="{LINE}" stroke-width="1.2"/>'
def button(x,y,w,txtfill=ACC,solid=True):
    return f'<rect x="{x}" y="{y}" width="{w}" height="10" rx="3" fill="{ACC if solid else PAPER}" stroke="{ACC}" stroke-width="1.2"/>'
def wrap(body, label_):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 150" fill="none" role="img" aria-label="{label_}"><title>{label_}</title><g stroke-linecap="round" stroke-linejoin="round">{body}</g></svg>'

svgs={}
# 1 All on one page: tall page, three sections, scrollbar, submit at bottom
b=blob()+paper(66,6,88,140)
y=17; b+=title(76,y,44)
for n in (2,1,1):
    y+=11; b+=f'<path d="M76 {y}h30" stroke="{INK}" stroke-width="2.5" stroke-linecap="round"/>'
    for k in range(n):
        y+=7; b+=label(76,y,22 if k==0 else 18); y+=3; b+=field(76,y,62,8); y+=8
b+=button(76,y+7,30)
b+=f'<rect x="145" y="12" width="4" height="128" rx="2" fill="{FIELD}"/><rect x="145" y="20" width="4" height="34" rx="2" fill="{STAR}"/>'
b+=star(176,30)+star(40,118,.8)+f'<circle cx="186" cy="110" r="3" fill="{MINT}"/>'
svgs['page']=wrap(b,'All on one page')

# 2 One section per page: stacked pages behind, one section, progress dots, Back / Next
b=blob()+paper(74,22,84,110)+paper(68,16,84,110)+paper(62,10,84,110)
b+=title(72,22,36)+f'<path d="M72 34h28" stroke="{INK}" stroke-width="2.5" stroke-linecap="round"/>'
b+=label(72,46,22)+field(72,49,64)+label(72,66,18)+field(72,69,64)+label(72,86,24)+field(72,89,64)
b+=''.join(f'<circle cx="{94+i*8}" cy="108" r="2.6" fill="{ACC if i==0 else LINE}"/>' for i in range(3))
b+=button(72,103,16,solid=False)+button(118,103,18)
b+=star(178,34)+star(36,104,.8)+f'<circle cx="190" cy="98" r="3" fill="{MINT}"/>'
svgs['steps']=wrap(b,'One section per page')

# 3 One question per page: progress bar, one big question, answer choices, one picked
b=blob()+paper(58,14,104,120)
b+=f'<rect x="68" y="24" width="84" height="4" rx="2" fill="{FIELD}" stroke="{LINE}" stroke-width=".8"/><rect x="68" y="24" width="34" height="4" rx="2" fill="{ACC}"/>'
b+=f'<path d="M68 42h70" stroke="{INK}" stroke-width="3" stroke-linecap="round"/><path d="M68 51h48" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
for i in range(3):
    yy=64+i*17; picked=i==1
    b+=f'<rect x="68" y="{yy}" width="84" height="12" rx="6" fill="{MINT if picked else FIELD}" stroke="{INK if picked else LINE}" stroke-width="{1.4 if picked else 1.2}"/>'
    b+=f'<circle cx="76" cy="{yy+6}" r="2.6" fill="{INK if picked else PAPER}" stroke="{INK if picked else LINE}" stroke-width="1"/>'
    b+=f'<path d="M84 {yy+6}h{40 if i!=2 else 30}" stroke="{INK if picked else LINE}" stroke-width="2" stroke-linecap="round"/>'
b+=f'<path d="M144 121l5 -4l-5 -4" stroke="{ACC}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
b+=star(184,40)+star(36,96,.8)+f'<circle cx="188" cy="112" r="3" fill="{MINT}"/>'
svgs['questions']=wrap(b,'One question per page')

# 4 Collapsible sections: three headers, first one open
b=blob()+paper(60,10,100,128)
def header(y,open_):
    s=f'<rect x="68" y="{y}" width="84" height="14" rx="3" fill="{BLOB if open_ else FIELD}" stroke="{INK if open_ else LINE}" stroke-width="1.2"/>'
    s+=f'<path d="M74 {y+7}h34" stroke="{INK if open_ else LINE}" stroke-width="2.5" stroke-linecap="round"/>'
    s+=(f'<path d="M140 {y+5}l4 4l4 -4" stroke="{INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' if open_ else f'<path d="M142 {y+3}l4 4l-4 4" stroke="{LINE}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>')
    return s
b+=title(68,20,40)+header(30,True)
b+=label(74,52,22)+field(74,55,72)+label(74,72,18)+field(74,75,72)
b+=header(92,False)+header(112,False)
b+=star(182,36)+star(38,110,.8)+f'<circle cx="190" cy="104" r="3" fill="{MINT}"/>'
svgs['accordion']=wrap(b,'Collapsible sections')

# 5 Tabs: tab strip with first tab active, fields below
b=blob()+paper(54,14,112,118)
b+=title(64,26,40)
b+=f'<path d="M62 52h96" stroke="{LINE}" stroke-width="1.2"/>'
for i in range(3):
    x=64+i*31; act=i==0
    b+=f'<path d="M{x+3} 45h20" stroke="{INK if act else LINE}" stroke-width="2.5" stroke-linecap="round"/>'
    if act: b+=f'<path d="M{x} 52h26" stroke="{ACC}" stroke-width="3" stroke-linecap="round"/>'
b+=label(64,66,22)+field(64,69,92)+label(64,86,18)+field(64,89,92)+label(64,106,26)+field(64,109,60)
b+=star(186,38)+star(36,104,.8)+f'<circle cx="192" cy="110" r="3" fill="{MINT}"/>'
svgs['tabs']=wrap(b,'Tabs')

import json
for k,v in svgs.items(): open(f'layout-{k}.svg','w').write(v)
json.dump(svgs,open('svgs.json','w'))
print({k:len(v) for k,v in svgs.items()})
