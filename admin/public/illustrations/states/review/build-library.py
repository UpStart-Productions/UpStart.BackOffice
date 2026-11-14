from pathlib import Path
import json, math, re, html, shutil

ROOT=Path(__file__).parent
OUT=ROOT/'assets'
OUT.mkdir(exist_ok=True)
I='#28334A'; V='#7C5CE7'; L='#EDE8FC'; M='#BCE5D8'; G='#C9D4E6'; W='#FFFFFF'; T='#368876'; C='#E97573'; Y='#F1CD83'

CSS='''
@keyframes appear{from{opacity:0}to{opacity:1}}
@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes slide{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:translateX(0)}}
@keyframes reveal{from{opacity:0;transform:scaleX(0)}to{opacity:1;transform:scaleX(1)}}
@keyframes grow{0%{opacity:0;transform:scale(.65)}80%{opacity:1;transform:scale(1.025)}100%{opacity:1;transform:scale(1)}}
@keyframes trace{from{stroke-dashoffset:1;opacity:0}to{stroke-dashoffset:0;opacity:1}}
@keyframes turn{from{opacity:0;transform:rotate(-32deg)}to{opacity:1;transform:rotate(0)}}
@keyframes swing{0%{transform:rotate(-8deg);opacity:0}55%{transform:rotate(4deg);opacity:1}80%{transform:rotate(-1deg)}100%{transform:rotate(0);opacity:1}}
@keyframes scan{0%{transform:translate(-6px,4px);opacity:0}35%{transform:translate(2px,-2px);opacity:1}70%{transform:translate(-2px,0);opacity:1}100%{transform:translate(0,0);opacity:1}}
.appear,.rise,.slide,.reveal,.grow,.turn,.swing,.scan,.trace{animation-duration:var(--duration,650ms);animation-delay:var(--delay,0ms);animation-fill-mode:both;animation-iteration-count:1;animation-timing-function:cubic-bezier(.22,1,.36,1);transform-box:fill-box;transform-origin:center}
.appear{animation-name:appear}.rise{animation-name:rise}.slide{animation-name:slide}.reveal{animation-name:reveal;transform-origin:left center}.grow{animation-name:grow}.turn{animation-name:turn}.swing{animation-name:swing;transform-origin:center top}.scan{animation-name:scan}.trace{animation-name:trace;stroke-dasharray:1;stroke-dashoffset:0}
@media(prefers-reduced-motion:reduce){.appear,.rise,.slide,.reveal,.grow,.turn,.swing,.scan,.trace{animation:none!important;transform:none!important;opacity:1!important;stroke-dashoffset:0!important}}
'''

def anim(body,kind='appear',delay=0,duration=650,id=None):
    return f'<g class="{kind}" style="--delay:{delay}ms;--duration:{duration}ms"'+(f' id="{id}"' if id else '')+f'>{body}</g>'
def path(d,fill='none',stroke=I,sw=1.5,cls='',delay=0,duration=650):
    a=f' d="{d}" fill="{fill}"'
    if stroke:a+=f' stroke="{stroke}" stroke-width="{sw}"'
    if cls:a+=f' class="{cls}" style="--delay:{delay}ms;--duration:{duration}ms"'
    if cls=='trace':a+=' pathLength="1"'
    return '<path'+a+'/>'
def rect(x,y,w,h,fill=W,r=7,stroke=I,sw=1.5):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>'
def circle(x,y,r,fill=W,stroke=I,sw=1.5):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>'
def line(x,y,w,color=G,sw=4,delay=800):
    return path(f'M{x} {y}h{w}',stroke=color,sw=sw,cls='trace',delay=delay,duration=420)
def check(x,y,size=20,color=T,delay=850,sw=4):
    return path(f'M{x} {y}l{size*.3} {size*.3}l{size*.7} {-size*.75}',stroke=color,sw=sw,cls='trace',delay=delay,duration=500)
def sparkle(x,y,size=9):
    return path(f'M{x} {y-size}Q{x+1} {y-1} {x+size} {y}Q{x+1} {y+1} {x} {y+size}Q{x-1} {y+1} {x-size} {y}Q{x-1} {y-1} {x} {y-size}Z',fill='#B6A3F1',sw=1.2)
def sheet(x=108,y=52,w=106,h=144):
    f=min(20,w*.22);r=min(8,w*.08)
    return path(f'M{x+r} {y}H{x+w-f}L{x+w} {y+f}V{y+h-r}Q{x+w} {y+h} {x+w-r} {y+h}H{x+r}Q{x} {y+h} {x} {y+h-r}V{y+r}Q{x} {y} {x+r} {y}Z',W)+path(f'M{x+w-f} {y}V{y+f*.7}Q{x+w-f} {y+f} {x+w-f*.7} {y+f}H{x+w}',G)
def avatar(x,y,r=15,fill=M):
    portrait=M if fill==W else W
    return circle(x,y,r,fill)+path(f'M{x-r*.58} {y+r*.65}Q{x} {y+r*.1} {x+r*.58} {y+r*.65}',fill=portrait,stroke=None)+circle(x,y-r*.17,r*.28,portrait,None)
def gear(x,y,r=25):
    pts=[]
    for j in range(48):
        angle=j*math.pi/24
        rr=r*(1 if j%6 in (1,2,3,4) else .79)
        pts.append((x+rr*math.cos(angle),y+rr*math.sin(angle)))
    return path('M'+'L'.join(f'{a:.1f} {b:.1f}' for a,b in pts)+'Z',M)+circle(x,y,r*.34,W)
def calendar_base():
    return rect(91,68,139,124)+path('M91 101H230V77Q230 68 221 68H100Q91 68 91 77Z',V)+path('M122 57V79M199 57V79',stroke=I,sw=4)
def tray_base():
    return path('M82 173L106 143H219L242 173V200H82Z','#B6A3F1')
def tray_front():
    return path('M82 171H124Q130 171 133 177L137 184H186L191 177Q194 171 201 171H242L238 197Q236 205 228 205H96Q87 205 86 197Z','#AE97EF')

blob=path('M62 169C36 144 43 113 65 98C86 84 87 54 117 45C147 35 166 56 187 51C222 42 253 61 264 87C277 117 259 138 267 162C278 195 246 216 213 212C181 208 163 220 136 210C110 200 84 191 62 169Z',L,None)

ASSETS=[]
def add(slug,title,category,art,compact,motion,uses):
    main=anim(blob,'appear',0,400)+art+anim(sparkle(264,101,7),'grow',2100,480)+anim(circle(76,161,3,M,None),'appear',1800,300)
    def doc(body,small=False):
        box='0 0 32 32' if small else '0 0 320 240'
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}" fill="none" role="img" aria-label="{html.escape(title)}"><title>{html.escape(title)}</title><style>{CSS}</style><g stroke-linecap="round" stroke-linejoin="round">{body}</g></svg>'
    (OUT/f'{slug}.svg').write_text(doc(main))
    (OUT/f'{slug}-compact.svg').write_text(doc(compact,True))
    ASSETS.append(dict(id=slug,title=title,category=category,status='For review',motion=motion,uses=uses,large=f'assets/{slug}.svg',compact=f'assets/{slug}-compact.svg'))

# Tasks: clipboard establishes the object, task rows draw top to bottom.
art=anim(rect(111,57,106,143),'rise',160,850)+anim(rect(134,49,59,18,M,5),'grow',450,500)
for j in range(3):
    y=101+j*29
    art+=anim(rect(129,y-5,12,12,L,3),'grow',900+j*300,400)+line(151,y+1,45-j*6,delay=1000+j*300)
art+=check(131,102,8,delay=1820,sw=2)
add('empty-tasks','Tasks','Work',art,anim(rect(7,5,19,23,W,4),'rise',0,450)+anim(rect(11,3,11,5,M,2),'grow',180,300)+line(12,14,9,V,2,400)+line(12,20,9,G,2,600),'Clipboard rises; boxes and lines draw individually; one check completes.',['My Tasks: no assignments','Project task list / board: no tasks','Project default tasks','Project open-task preview','Dashboard: My work and Today'])

# Projects: the document rises behind the folder front, whose silhouette remains stable.
art=anim(path('M81 89V77Q81 70 89 70H137L150 82H233Q240 82 240 89V193H81Z','#B6A3F1'),'rise',100,700)
art+=anim(rect(111,62,95,119,W,7),'rise',400,900)+line(128,91,49,V,5,1350)+line(128,110,62,G,3,1550)+line(128,126,42,G,3,1750)
art+=anim(path('M79 112H240L226 194Q225 202 216 202H96Q88 202 87 194Z',M),'rise',100,700)
add('empty-projects','Projects','Work',art,anim(path('M4 11V8Q4 6 7 6H14L17 9H27V25H4Z',M),'rise',0,500)+anim(path('M4 12H28L25 26H6Z',W),'slide',220,500),'Folder settles; a document rises behind the front; document details draw.',['Projects: first use and no active projects','Tasks project browser','Related projects on account records','Task sidebar with no projects'])

# Accounts: three different architectural forms make an organization distinct from a person.
art=anim(rect(85,100,58,98,M,5),'rise',180,850)+anim(rect(138,61,75,137,W,6),'rise',300,900)+anim(rect(207,119,39,79,'#DFE6F1',4),'rise',450,850)
for j in range(3):
    art+=line(153,87+j*25,12,V,5,1150+j*210)+line(184,87+j*25,12,V,5,1250+j*210)
art+=anim(rect(165,166,22,32,M,3),'reveal',1780,420)+path('M74 199H253',stroke=I)
add('empty-accounts','Accounts','Relationships',art,anim(rect(5,12,9,16,M,2),'rise',100,500)+anim(rect(14,4,13,24,W,2),'rise',0,600)+line(18,11,5,V,2,500)+line(18,17,5,V,2,650),'Buildings rise in staggered order; windows and doorway appear.',['Accounts and Client-filtered accounts: first use','Linked accounts on a person'])

# People: profile card + offset smaller card, rather than a generic crowd.
art=anim('<g transform="rotate(-8 128 134)">'+rect(77,86,90,112,'#F6F7FB',8)+avatar(122,119,17,M)+'</g>','slide',200,800)
art+=anim('<g transform="rotate(5 185 126)">'+rect(137,61,100,136,W,8)+anim(avatar(187,102,22,M),'grow',800,500)+line(160,142,53,V,5,1300)+line(160,156,39,G,3,1500)+line(160,170,47,G,3,1700)+'</g>','rise',330,850)
add('empty-people','People','Relationships',art,anim(rect(4,5,24,23,W,4),'rise',0,500)+anim(avatar(16,14,6,M),'grow',350,400)+line(11,24,10,V,2,750),'Profile cards enter; portrait resolves; contact details draw.',['People: first use','People linked to an account','Project contacts','No people linked to a pipeline card'])

# Team: three complementary avatars with a subtle linking arc.
art=path('M102 144Q156 108 215 144',stroke=G,sw=2,cls='trace',delay=950,duration=800)
for j,(x,y,r) in enumerate([(105,132,29),(211,132,29),(159,104,39)]):art+=anim(avatar(x,y,r,[M,'#DFE6F1',W][j]),'grow',250+j*300,700)
add('empty-team','Team members','Relationships',art,anim(avatar(9,17,6,M),'grow',0,500)+anim(avatar(23,17,6,M),'grow',220,500)+anim(avatar(16,11,7,W),'grow',430,500),'Team members arrive individually and a connection arc joins them.',['Project members','Users list','Role with no members'])

# Pipeline: deliberate board structure, then cards in each lane; no misleading progression.
art=anim(rect(74,68,176,130,W,8),'rise',150,850)+path('M132 90V183M191 90V183',stroke=G)
for j,x in enumerate([88,147,206]):
    art+=line(x,84,28,[V,T,V][j],4,800+j*160)
    art+=anim(rect(x,104,29,40,[L,'#EDF8F3',L][j],4,stroke=G),'rise',1100+j*260,600)
    art+=line(x+6,118,17,G,2,1600+j*200)
add('empty-pipeline','Pipeline','Relationships',art,anim(rect(3,5,26,23,W,3),'rise',0,500)+path('M12 10V25M21 10V25',stroke=G,sw=1)+anim(rect(5,12,5,8,L,1,stroke=None),'rise',500,400)+anim(rect(14,12,5,6,M,1,stroke=None),'rise',700,400),'Board appears, lane headings draw, then example card silhouettes settle into place.',['Entire pipeline with no cards; individual lanes retain text drop targets','Dashboard: relationship overview'])

# Time: hand advances once to its resting position, never an indefinite ticking clock.
art=anim(circle(160,128,71,M),'grow',120,800)+anim(circle(153,120,66,W),'grow',180,800)
for j,(x,y,x2,y2) in enumerate([(153,65,153,72),(208,120,201,120),(153,175,153,168),(98,120,105,120)]):art+=path(f'M{x} {y}L{x2} {y2}',stroke=G,sw=3,cls='trace',delay=800+j*120,duration=300)
art+=anim(path('M153 83V120L181 137',stroke=V,sw=5),'turn',1000,1200).replace('--duration:1200ms','--duration:1200ms;transform-origin:0% 68.5%')+anim(circle(153,120,4,V,None),'grow',900,400)
add('empty-time','Time tracking','Money & time',art,anim(circle(16,16,12,W),'grow',0,500)+anim(path('M16 8V16L22 20',stroke=V,sw=2),'turn',300,800),'Clock face settles; markers draw; hands sweep once into position.',['Time tracking: no entries for day','Dashboard: My time','Time report: no entries'])

# Expenses: receipt silhouette with alternating torn edge and a mint total.
art=anim(path('M113 52H210V199L201 193L192 199L183 193L174 199L165 193L156 199L147 193L138 199L129 193L120 199L113 193Z',W),'rise',180,950)
art+=line(131,78,58,V,5,1100)
for j in range(3):art+=line(131,106+j*20,32,G,3,1330+j*220)+line(181,106+j*20,11,G,3,1430+j*220)
art+=anim(rect(130,174,64,10,M,3,stroke=None),'reveal',2100,500)
art+=anim(circle(227,173,22,'#EDF8F3'),'grow',1700,600)+path('M227 163V183M221 166H229Q234 166 234 170Q234 174 228 174H225Q219 174 219 179Q219 182 226 182H233',stroke=T,sw=1.8,cls='trace',delay=2200,duration=650)
add('empty-expenses','Expenses','Money & time',art,anim(path('M7 3H25V29L22 27L19 29L16 27L13 29L10 27L7 29Z',W),'rise',0,600)+line(11,10,10,V,2,600)+line(11,16,7,G,2,800)+line(11,22,10,T,2,1000),'Receipt rises, each expense row writes on, then the total and currency detail resolve.',['Expenses: empty period','Expense reports when implemented','Receipt attachments'])

# Bookings and schedule have related forms, different contents.
for schedule in [False,True]:
    art=anim(calendar_base(),'rise',180,850)
    if schedule:
        for j,x in enumerate([108,141,174,207]):art+=path(f'M{x} 114V178',stroke=G,sw=1,cls='trace',delay=900+j*100,duration=450)
        for j,(x,y,w,col) in enumerate([(108,122,27,M),(141,143,27,L),(174,123,27,M)]):art+=anim(rect(x,y,w,19,col,4,stroke=None),'reveal',1300+j*280,500)
    else:
        for j in range(6):art+=anim(rect(110+(j%3)*35,117+(j//3)*28,18,14,M if j==4 else '#F1F4F8',3,stroke=None),'grow',1000+j*150,400)
        art+=check(150,151,10,delay=2050,sw=2)
    compact=anim(rect(4,7,24,22,W,4),'rise',0,550)+path('M4 13H28M10 4V10M22 4V10',stroke=V,sw=2)
    if schedule:
        compact+=anim(rect(8,17,7,4,M,1,stroke=None),'reveal',650,450)+anim(rect(17,22,7,4,L,1,stroke=None),'reveal',850,450)
    else:
        compact+=anim(rect(12,18,8,7,M,2,stroke=None),'grow',650,450)
    add('empty-schedule' if schedule else 'empty-bookings','Schedule' if schedule else 'Bookings','Scheduling',art,compact,'Calendar rises; '+('shift blocks build across the week.' if schedule else 'day cells appear in sequence; selected day receives a small check.'),['Care schedule: no shifts','Care account: no upcoming shifts','Dashboard: My shifts','Scheduled vs visited hours report'] if schedule else ['Bookings: first use and selected type with no bookings','Booking calendar'])

art=anim(calendar_base(),'rise',150,800)+line(112,127,45,G,4,1050)+line(112,146,65,G,4,1250)+anim(gear(225,171,30),'turn',1400,1000)
add('empty-booking-types','Booking types','Scheduling',art,anim(rect(4,7,22,20,W,4),'rise',0,500)+path('M4 13H26',stroke=V,sw=2)+anim(gear(23,23,7),'turn',500,700),'A calendar establishes the context; details draw and a configuration gear turns into place.',['Booking types: no types configured'])

# Forms: a clear input field and choice controls.
art=anim(sheet(),'rise',180,900)+line(125,82,48,V,5,1050)
art+=anim(rect(124,103,73,17,'#F6F7FB',4,stroke=G),'reveal',1250,500)
for j in range(2):art+=anim(circle(129,140+j*22,5,M if j==0 else W,G),'grow',1650+j*260,400)+line(144,140+j*22,44,G,3,1750+j*260)
add('empty-forms','Forms','Forms',art,anim(rect(7,3,19,26,W,3),'rise',0,550)+line(11,10,10,V,2,600)+anim(rect(11,15,10,5,L,1,stroke=None),'reveal',850,400)+line(11,24,8,G,2,1100),'Form sheet rises; heading, input field, and choices draw individually.',['Forms directory','Task intake forms','Account forms panel','Form with no fields'])

art=anim(tray_base(),'appear',100,500)+anim(sheet(117,62,88,126),'rise',350,1000)+line(132,94,48,V,4,1400)+line(132,114,44,G,3,1600)+line(132,132,32,G,3,1800)+anim(tray_front(),'appear',100,500)
art+=anim(path('M227 74L267 88L237 111L239 94L227 74Z',M)+path('M239 94L267 88',stroke=I),'slide',1550,850)
add('empty-form-submissions','Form submissions','Forms',art,anim(path('M4 17L8 11H24L28 17V27H4Z',M),'rise',0,500)+anim(rect(10,4,13,16,W,2),'rise',350,650)+path('M4 18H11L13 22H19L21 18H28',stroke=I,sw=1.2),'Response paper rises; form detail writes in; a small paper plane arrives and rests.',['Form submissions: none received','Activity: no forms waiting for review'])

# Form builder: separate blocks assemble visibly without imitating a live UI.
art=anim(rect(92,60,136,138,W,8),'rise',150,850)+line(109,82,55,V,5,900)
for j in range(3):
    art+=anim(rect(109,101+j*28,100,19,[L,'#EDF8F3','#F1F4F8'][j],4,stroke=G),'slide',1100+j*300,550)+line(128,110+j*28,58,G,3,1450+j*300)
    art+=anim(circle(118,110+j*28,2,V,None),'grow',1350+j*300,350)
add('empty-form-builder','Form builder','Forms',art,anim(rect(4,3,24,26,W,3),'rise',0,500)+anim(rect(8,8,16,5,L,1,stroke=None),'slide',450,450)+anim(rect(8,16,16,5,M,1,stroke=None),'slide',700,450),'A form canvas settles, then sections and field blocks assemble from top to bottom.',['Form builder: no sections or fields','Form-workspace section sidebar','Form score areas and profiles'])

# Ledger: two open facing pages with a true spine rather than a plain invoice.
art=anim(path('M160 75Q123 54 83 66V186Q123 174 160 195Q198 174 239 186V66Q198 54 160 75Z',M),'rise',120,850)
art+=anim(path('M160 67Q127 47 91 58V176Q128 168 160 187Q193 168 231 176V58Q194 47 160 67Z',W),'grow',350,800)+path('M160 67V187',stroke=I)
for j in range(4):art+=line(107,89+j*21,34,G,3,1150+j*180)+line(177,89+j*21,36,V if j==0 else G,3,1250+j*180)
add('empty-ledger','Accounting ledger','Money & time',art,anim(path('M16 8Q10 3 4 5V26Q10 24 16 29Q22 24 28 26V5Q22 3 16 8Z',W),'grow',0,650)+path('M16 8V29',stroke=I,sw=1.2)+line(8,12,4,V,1.5,650)+line(20,12,4,T,1.5,800),'Open ledger settles; matching entry lines write across both pages.',['Accounting journal: first use','Chart of accounts: no accounts'])

art=anim(path('M81 99L160 54L239 99Z',W)+rect(84,99,152,15,M,3)+rect(79,190,164,13,M,3),'rise',140,850)
for j,x in enumerate([103,142,181,220]):art+=anim(rect(x,114,10,76,W,2),'reveal',950+j*140,600)
art+=anim(circle(231,176,29,W),'grow',1500,550)+path('M231 158V186M220 176L231 187L242 176',stroke=V,sw=3,cls='trace',delay=1900,duration=650)
add('empty-bank-transactions','Bank transactions','Money & time',art,anim(path('M3 12L16 4L29 12Z',M)+path('M5 28H27M8 14V25M16 14V25M24 14V25',stroke=I,sw=2),'rise',0,650),'Bank silhouette assembles; an import arrow draws once into its resting position.',['Bank import: no transactions imported'])

# Inbox remains genuinely empty; the completion illustration is separate.
art=anim(tray_base(),'rise',180,850)+anim(path('M108 142V107Q108 99 116 99H207Q215 99 215 107V142',M),'rise',450,900)+anim(tray_front(),'rise',180,850)
art+=path('M137 119Q159 109 183 119',stroke=V,sw=3,cls='trace',delay=1300,duration=650)
add('empty-inbox','Inbox','Activity',art,anim(path('M4 18L9 8H23L28 18V27H4Z',M),'rise',0,650)+path('M4 18H11L13 22H19L21 18H28',stroke=I,sw=1.5),'Empty tray settles; the inner lip and a soft accent draw in.',['Activity: no unfiled messages','Tasks inbox','General empty message queue'])

art=anim(rect(107,76,115,113,'#DFE6F1',8),'slide',170,800)+anim(rect(95,62,115,122,W,8),'rise',300,850)
art+=line(114,86,49,V,5,1100)+line(114,105,72,G,3,1300)+line(114,121,54,G,3,1500)
art+=anim(circle(210,170,37,M),'grow',1600,600)+check(190,170,38,delay=2050,sw=5)
add('empty-all-caught-up','All caught up','Activity',art,anim(circle(16,16,13,'#EDF8F3',T),'grow',0,550)+check(9,16,14,delay=550,sw=2.2),'Work cards settle; a completion badge appears and its check draws once.',['Activity to-do queues clear','My Tasks: nothing due','People: nothing needs review','Dashboard: no overdue/unbilled work','Form submissions: nothing pending review'])

# Activity: timeline with event cards; compact maintains the temporal structure.
art=path('M105 67V194',stroke=G,sw=2,cls='trace',delay=250,duration=1100)
for j,y in enumerate([83,126,169]):
    art+=anim(circle(105,y,7,M if j==1 else L),'grow',750+j*340,450)+anim(rect(125,y-17,106,34,W,6),'slide',850+j*340,650)+line(139,y-3,45,V if j==0 else G,3,1300+j*300)+line(139,y+7,68,G,2,1450+j*300)
add('empty-activity','Activity history','Activity',art,path('M8 5V27',stroke=G,sw=1.5,cls='trace',delay=0,duration=800)+''.join(anim(circle(8,y,2.5,M),'grow',200+j*200,350)+line(15,y,11,V if j==0 else G,2,400+j*200) for j,y in enumerate([8,16,24])),'Timeline draws downward; event nodes and their cards enter in order.',['Account/person activity timelines','Dashboard: Since last time','Dashboard: relationship suggestions','Activity with no history'])

# Reports: bars are a recognizable illustrative motif, not fabricated live analytics.
art=anim(rect(84,66,151,128,W,8),'rise',150,850)+line(104,87,55,V,5,1050)
art+=path('M106 109V174H215',stroke=G,sw=1.5,cls='trace',delay=1150,duration=700)
for j,(x,y,h,col) in enumerate([(123,144,29,L),(154,128,45,M),(185,111,62,'#B6A3F1')]):art+=anim(rect(x,y,19,h,col,3,stroke=None),'grow',1450+j*260,650)
add('empty-reports','Reports','Reporting',art,anim(rect(3,4,26,24,W,3),'rise',0,550)+anim(rect(8,19,4,5,L,1,stroke=None),'grow',550,450)+anim(rect(14,14,4,10,M,1,stroke=None),'grow',750,450)+anim(rect(20,9,4,15,'#B6A3F1',1,stroke=None),'grow',950,450),'Report panel settles; axes draw; bars build in staggered order.',['Reports: not run yet','Time/invoice/task reports: empty date range','Care hours report: no shifts/visits','Dashboard: first-run financial/time charts'])

# Files: two sheets plus an actual drawn paperclip.
art=anim('<g transform="rotate(-8 145 133)">'+sheet(94,66,100,128)+'</g>','slide',150,800)+anim('<g transform="rotate(5 178 123)">'+sheet(132,56,96,135)+line(148,94,45,V,4,1300)+line(148,113,59,G,3,1500)+line(148,132,40,G,3,1700)+'</g>','rise',350,850)
art+=path('M204 145L188 162Q178 172 169 163Q160 154 170 144L196 118Q204 110 211 117Q218 124 210 132L186 156Q182 160 179 157Q176 154 180 150L199 131',stroke=T,sw=4,cls='trace',delay=1900,duration=850)
add('empty-files','Files & attachments','Record details',art,anim(sheet(8,3,18,25),'rise',0,600)+path('M19 15L13 21Q10 24 8 21Q6 19 9 16L17 8',stroke=T,sw=1.7,cls='trace',delay=650,duration=650),'Document sheets settle; details write on and the paperclip draws around the attachment.',['Shared file attachments','Record file panels'])

# Links: interlocking link forms with broad white shapes and mint inner treatment.
art=anim(rect(87,78,146,107,W,8),'rise',150,850)+line(103,96,49,V,4,1100)
art+=anim(path('M160 141L177 124Q188 113 200 125Q212 137 201 148L184 165Q173 176 162 165',stroke=T,sw=9),'slide',1100,1000)
art+=anim(path('M162 143L145 160Q134 171 122 159Q110 147 121 136L138 119Q149 108 160 119',stroke='#9F87E6',sw=9),'slide',1450,1000)
add('empty-links','Saved links','Record details',art,anim(path('M17 13L20 10Q24 6 27 10Q30 14 26 18L21 23Q17 27 13 23',stroke=T,sw=3),'slide',0,700)+anim(path('M15 19L12 22Q8 26 5 22Q2 18 6 14L11 9Q15 5 19 9',stroke=V,sw=3),'slide',300,700),'Two link halves slide gently into their connected resting position.',['Shared saved links','Form share links'])

# Notes: notebook and pencil with a drawn line, not simulated handwriting text.
art=anim(rect(101,58,115,144,W,7),'rise',180,850)+path('M120 58V202',stroke=V,sw=4)
for j in range(4):art+=line(137,88+j*24,55 if j<3 else 31,G,3,1100+j*210)
art+=anim('<g transform="rotate(33 219 138)">'+path('M211 77H225V175L218 189L211 175Z',M)+path('M211 175H225M218 189L215 183H221Z',I)+'</g>','slide',1600,850)
add('empty-notes','Notes','Record details',art,anim(rect(6,3,20,26,W,3),'rise',0,550)+path('M11 3V29',stroke=V,sw=2)+line(15,11,7,G,1.5,600)+line(15,17,7,G,1.5,800)+line(15,23,5,G,1.5,1000),'Notebook rises; note lines draw one by one; pencil settles beside it.',['Shared notes','Task description if a larger prompt is appropriate'])

def bubble(x,y,w,h,fill):
    r=min(10,w*.15,h*.25);tail=min(15,h*.25)
    return path(f'M{x+r} {y}H{x+w-r}Q{x+w} {y} {x+w} {y+r}V{y+h-r}Q{x+w} {y+h} {x+w-r} {y+h}H{x+w*.24}L{x+w*.1} {y+h+tail}V{y+h}Q{x} {y+h} {x} {y+h-r}V{y+r}Q{x} {y} {x+r} {y}Z',fill)

art=anim(bubble(82,71,132,88,W),'rise',200,850)
for j in range(3):art+=anim(circle(119+j*28,114,5,[V,M,V][j],None),'grow',1150+j*250,500)
add('empty-comments','Comments','Record details',art,anim(bubble(3,5,26,18,W),'rise',0,550)+''.join(anim(circle(10+j*6,14,1.5,V,None),'grow',500+j*160,350) for j in range(3)),'Comment bubble arrives; its three dots appear once in a short sequence and stay still.',['Task comments','Other comment threads'])

art=anim(bubble(83,68,128,82,W),'rise',180,850)+anim(bubble(151,133,93,53,M),'slide',650,800)+line(103,94,70,V,4,1200)+line(103,111,49,G,3,1450)+line(168,155,52,T,3,1750)
add('empty-conversations','Conversations','Activity',art,anim(bubble(3,4,22,16,W),'rise',0,550)+anim(bubble(12,16,17,10,M),'slide',450,650),'Opening message bubble arrives; a reply follows; message lines reveal in reading order.',['Help assistant: no saved conversations','Help report viewer: no messages'])

# Search: lens glides over the card and settles, with a short neutral dash inside.
art=anim(rect(82,91,132,88,W,7),'rise',180,850)+line(99,111,56,G,4,1050)+line(99,130,88,G,3,1250)+line(99,148,68,G,3,1450)
art+=anim(circle(197,117,38,'#EFF9F6')+circle(197,117,29,W)+path('M225 145L251 171',stroke=V,sw=13)+path('M225 145L251 171',stroke=I,sw=1.5)+path('M188 117H206',stroke=G,sw=3),'scan',1000,1400)
add('empty-search','No matches','Search',art,anim(circle(14,13,9,W),'scan',0,850)+path('M21 20L28 27',stroke=V,sw=4)+line(10,13,8,G,1.5,650),'Magnifying glass makes one short search movement and settles; a neutral dash indicates no matches.',['Global search','Filtered accounts, people, projects, invoices, forms and tasks','Filtered bookings, expenses and activity','Compact no-match pickers'])

# Settings: configuration list + cog rotate once, distinct from an error or search.
art=anim(rect(88,68,126,127,W,7),'rise',180,850)
for j in range(3):
    art+=line(105,96+j*31,66,G,3,1050+j*230)+anim(circle(124+j*13,96+j*31,6,M),'grow',1200+j*230,450)
art+=anim(gear(214,168,35),'turn',1500,1100)
add('empty-settings','Configuration','Settings',art,anim(gear(16,16,12),'turn',0,1000),'Configuration sliders draw; controls appear; the gear makes one short settling turn.',['Expense categories','Expense payment methods','Custom organization-field options','Project custom fields','Form scoring roles/profiles','Other empty configuration lists'])

# API key deserves an easily recognized object; no actual credential characters.
art=anim(rect(83,89,155,89,W,8),'rise',160,850)+line(101,108,56,G,3,1050)
art+=anim(circle(126,144,18,M)+circle(126,144,6,W)+path('M144 144H216M199 144V157M210 144V153',stroke=V,sw=6),'turn',1000,1100)
add('empty-api-keys','API keys','Settings',art,anim(circle(10,13,7,M)+circle(10,13,2.5,W)+path('M17 13H29M24 13V19M28 13V17',stroke=V,sw=3),'turn',0,850),'A credential card settles; a simple key turns into place without displaying secret data.',['Settings: no API keys'])

# Notifications: bell pivots once and settles, rather than continuously ringing.
art=anim(path('M117 151V112Q117 75 153 75Q189 75 189 112V151L201 165H105Z',W)+path('M153 63V75',stroke=V,sw=4)+path('M139 176Q153 192 167 176',M),'swing',280,1500)
art+=path('M208 95Q220 115 212 133',stroke=G,sw=2,cls='trace',delay=1350,duration=650)
add('empty-notifications','Notifications','Activity',art,anim(path('M8 22V13Q8 5 16 5Q24 5 24 13V22L27 25H5Z',W)+path('M12 28H20',stroke=T,sw=2),'swing',0,1000),'Bell makes one gentle pivot and settles; a single light accent completes.',['Notifications dropdown: no unread notifications'])

# Line items: a tiny register illustration for invoice composition, never a full-screen takeover.
art=anim(rect(85,70,152,125,W,8),'rise',160,850)+line(104,92,65,V,5,1000)
for j in range(3):art+=anim(rect(104,111+j*23,8,8,M,2,stroke=None),'grow',1200+j*270,350)+line(122,115+j*23,58,G,3,1300+j*270)+line(203,115+j*23,14,G,3,1400+j*270)
add('empty-line-items','Line items','Money & time',art,anim(rect(4,5,24,23,W,3),'rise',0,550)+line(9,11,14,V,2,550)+line(9,17,9,G,2,750)+line(9,23,14,G,2,950),'Register panel appears; line-item bullets, descriptions, and amounts draw in sequence.',['Invoice editor: no line items','Invoice detail: no line items','No uninvoiced time or reimbursable expenses in a selected period'])

(ROOT/'manifest.json').write_text(json.dumps(ASSETS,indent=2)+'\n')
print(f'Built {len(ASSETS)} design families; {len(ASSETS)*2} SVG files.')
