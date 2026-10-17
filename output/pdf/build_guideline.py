"""Build the Bengali handbook from its editable Markdown source.

Requires reportlab >=4.4, uharfbuzz, fonttools and pypdf.
Run with the bundled Python runtime on Windows. No application/database access.
"""
from pathlib import Path
import re, html, json
from fontTools.ttLib import TTCollection
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak,
    Table, TableStyle, KeepTogether,
)
from reportlab.platypus.tableofcontents import TableOfContents
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output' / 'pdf'
TMP = ROOT / 'tmp' / 'pdfs'
TMP.mkdir(parents=True, exist_ok=True)
SOURCE = OUT / 'dune-grills-admin-inventory-guideline-bn.md'
PDF = OUT / 'dune-grills-admin-inventory-guideline-bn.pdf'

# HarfBuzz shapes Bengali conjuncts and vowel signs before PDF text placement.
collection = TTCollection('C:/Windows/Fonts/Nirmala.ttc')
for name, index in [('Bangla', 3), ('BanglaBold', 4)]:
    target = TMP / f'{name}.ttf'
    collection.fonts[index].save(target)
    pdfmetrics.registerFont(TTFont(name, str(target), shapable=True))
pdfmetrics.registerFontFamily('Bangla', normal='Bangla', bold='BanglaBold', italic='Bangla', boldItalic='BanglaBold')

INK = colors.HexColor('#22323b')
MUTED = colors.HexColor('#60717a')
GOLD = colors.HexColor('#b97920')
TEAL = colors.HexColor('#16565a')
LIGHT = colors.HexColor('#eef4f4')
W,H = A4
styles = {
    'body': ParagraphStyle('body', fontName='Bangla', fontSize=11.2, leading=19.5,
        textColor=INK, spaceAfter=7, shaping=1, allowWidows=0, allowOrphans=0),
    'h1': ParagraphStyle('h1', fontName='BanglaBold', fontSize=22, leading=32,
        textColor=TEAL, spaceAfter=15, shaping=1, keepWithNext=True),
    'h2': ParagraphStyle('h2', fontName='BanglaBold', fontSize=12, leading=20,
        textColor=TEAL, spaceBefore=10, spaceAfter=5, shaping=1, keepWithNext=True),
    'note': ParagraphStyle('note', fontName='Bangla', fontSize=10.7, leading=18.5,
        textColor=INK, backColor=colors.HexColor('#fff4df'), borderColor=GOLD,
        borderWidth=0.6, borderPadding=9, spaceBefore=7, spaceAfter=12, shaping=1),
    'cell': ParagraphStyle('cell', fontName='Bangla', fontSize=9.8, leading=17,
        textColor=INK, shaping=1),
    'cellhead': ParagraphStyle('cellhead', fontName='BanglaBold', fontSize=9.8,
        leading=17, textColor=colors.white, shaping=1),
    'small': ParagraphStyle('small', fontName='Bangla', fontSize=9, leading=15.5,
        textColor=MUTED, shaping=1, spaceAfter=5),
    'toc': ParagraphStyle('toc', fontName='Bangla', fontSize=10.5, leading=18,
        textColor=INK, shaping=1, leftIndent=0, rightIndent=8, spaceAfter=0),
}

def escaped(text):
    text=html.escape(text, quote=False)
    text=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',text)
    text=re.sub(r'`([^`]+)`',r'<font color="#16565a">\1</font>',text)
    return text

def p(text, style='body'):
    return Paragraph(escaped(text), styles[style])

def footer(canvas, doc):
    if doc.page == 1:
        return
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor('#d6e1e2'))
    canvas.line(44, 43, W-44, 43)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(44, 29, 'DUNE & GRILLS  |  ADMIN + INVENTORY  |  v1.0')
    canvas.drawRightString(W-44, 29, str(doc.page))
    canvas.setFont('Helvetica', 7.5)
    canvas.drawString(44, H-28, 'USER HANDBOOK / BANGLA')
    canvas.drawRightString(W-44, H-28, '17 OCT 2026')
    canvas.restoreState()

class Handbook(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(str(filename), pagesize=A4, leftMargin=46, rightMargin=46,
            topMargin=54, bottomMargin=57, title='Dune & Grills - Admin ও Inventory ব্যবহার নির্দেশিকা',
            author='Dune & Grills', subject='সহজ বাংলা ব্যবহার নির্দেশিকা; স্থানীয় কোড পর্যালোচনা ১৭ অক্টোবর ২০২৬')
        self.addPageTemplates(PageTemplate(id='main', frames=[Frame(46,57,W-92,H-111,id='content',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)], onPage=footer))
        self.chapter_pages=[]
    def beforeDocument(self):
        self.chapter_pages=[]
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and getattr(flowable,'chapter_key',None):
            key=flowable.chapter_key
            self.canv.bookmarkPage(key)
            # Keep original Unicode; shaped fragments contain internal glyph IDs.
            label=flowable.chapter_label
            self.canv.addOutlineEntry(label,key,level=0,closed=False)
            self.notify('TOCEntry',(0,label,self.page,key))
            self.chapter_pages.append({'title':label,'page':self.page,'anchor':key})

class BengaliContents(TableOfContents):
    # The stock TOC appends an onDraw fragment. ReportLab's shaped paragraph
    # splitter cannot handle that fragment; a two-column table keeps text shaped.
    def wrap(self, availWidth, availHeight):
        entries=self._lastEntries or [(0,'সূচিপত্র তৈরি হচ্ছে',0,None)]
        rows=[]
        for level,label,page,key in entries:
            title=escaped(label)
            number=str(page)
            if key:
                title=f'<a href="#{key}" color="#16565a">{title}</a>'
                number=f'<a href="#{key}">{number}</a>'
            rows.append([Paragraph(title,styles['toc']),Paragraph(number,styles['toc'])])
        self._table=Table(rows,colWidths=[availWidth-42,42],style=TableStyle([
            ('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),
            ('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),2),
            ('BOTTOMPADDING',(0,0),(-1,-1),2),
        ]))
        self.width,self.height=self._table.wrapOn(self.canv,availWidth,availHeight)
        return self.width,self.height

story=[]
story += [Spacer(1,65)]
story.append(Paragraph('DUNE <font color="#b97920">&amp;</font> GRILLS',ParagraphStyle('brand',fontName='Helvetica-Bold',fontSize=28,leading=36,textColor=TEAL)))
story += [Spacer(1,34),p('Admin ও Inventory','h1')]
story.append(Paragraph('ব্যবহার নির্দেশিকা',ParagraphStyle('cover',fontName='BanglaBold',fontSize=31,leading=45,shaping=1,textColor=TEAL)))
story += [Spacer(1,16),p('কোন ফিচার কী কাজে লাগে, কীভাবে ব্যবহার করবেন এবং কোন নিয়ম মেনে চলবেন।')]
story += [Spacer(1,22),p('সহজ বাংলা • ধাপে ধাপে কাজ • বাস্তবসম্মত নমুনা','h2')]
story += [Spacer(1,40),p('সংস্করণ ১.০ | প্রস্তুত: ১৭ অক্টোবর ২০২৬'),p('প্রকল্পের স্থানীয় কোড: 2f854d5','small')]
story += [Spacer(1,15),p('এই বই স্থানীয় প্রজেক্টের পেজ, ফর্ম, অনুমতি ও কার্যপ্রবাহ দেখে লেখা। বাস্তব সার্ভারে লগইন করে কাজ সম্পন্ন করার পরীক্ষা করা হয়নি। সব উদাহরণ নমুনা; কোনো বাস্তব তথ্য বা সেটিং পরিবর্তন করা হয়নি।','note')]
story.append(PageBreak())
story += [p('সূচিপত্র','h1'),p('পৃষ্ঠা নম্বরে ক্লিক করলে সংশ্লিষ্ট অধ্যায়ে যাওয়া যাবে। PDF-এর bookmarks দিয়েও অধ্যায় খুঁজতে পারবেন।','small')]
toc=BengaliContents()
toc.levelStyles=[styles['toc']]
toc.dotsMinLevel=0
story += [toc, PageBreak()]

lines=SOURCE.read_text(encoding='utf-8').splitlines()
i=0
chapter=0
while i < len(lines):
    line=lines[i].strip()
    if not line or line.startswith('<!--'):
        i+=1; continue
    if line.startswith('# '):
        if chapter: story.append(PageBreak())
        chapter+=1
        para=p(line[2:],'h1')
        para.chapter_key=f'chapter-{chapter}'
        para.chapter_label=line[2:]
        story.append(para)
    elif line.startswith('## '):
        story.append(p(line[3:],'h2'))
    elif line.startswith('> '):
        story.append(p(line[2:],'note'))
    elif line.startswith('|'):
        rows=[]
        while i < len(lines) and lines[i].strip().startswith('|'):
            raw=lines[i].strip().strip('|').split('|')
            if not all(re.fullmatch(r'[\s:-]+',c) for c in raw):
                rows.append([c.strip() for c in raw])
            i+=1
        count=max(map(len,rows))
        width=(W-92)/count
        table=Table([[p(c,'cellhead' if n==0 else 'cell') for c in row] for n,row in enumerate(rows)],colWidths=[width]*count,repeatRows=1,hAlign='LEFT')
        table.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,0),TEAL),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,LIGHT]),
            ('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),
            ('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),8),
            ('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,0),0.8,TEAL),
        ]))
        story += [table,Spacer(1,10)]
        continue
    else:
        story.append(p(line))
    i+=1

doc=Handbook(PDF)
doc.multiBuild(story)
reader=PdfReader(PDF)
manifest={'pdf':str(PDF),'source':str(SOURCE),'pages':len(reader.pages),'chapters':doc.chapter_pages,'source_commit':'2f854d5','date':'2026-10-17','timezone':'Asia/Riyadh'}
(TMP/'guideline-pagination.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'pages':len(reader.pages),'chapters':chapter,'bytes':PDF.stat().st_size,'pdf':str(PDF)},ensure_ascii=True))
