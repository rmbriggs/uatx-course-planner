import sys, os, glob, re
def reflow(tsvfiles, out):
    pages = {}
    for f in tsvfiles:
        cur=None
        for line in open(f, encoding='utf-8', errors='replace'):
            line=line.rstrip('\n')
            if line.startswith('===PAGE '):
                cur=line[8:].rstrip('=')
                pages.setdefault(cur, [])
                continue
            if cur is None: continue
            parts=line.split('\t',4)
            if len(parts)<5: continue
            try: x,y,w,h=[float(p) for p in parts[:4]]
            except ValueError: continue
            pages[cur].append((y,x,w,h,parts[4]))
    with open(out,'w',encoding='utf-8') as o:
        for pg in sorted(pages):
            o.write(f"\n\n########## {pg} ##########\n")
            items=sorted(pages[pg], key=lambda t:(round(t[0],3), t[1]))
            rows=[]
            for it in items:
                if rows and abs(it[0]-rows[-1][0][0]) < 0.008:
                    rows[-1].append(it)
                else:
                    rows.append([it])
            for r in rows:
                r.sort(key=lambda t:t[1])
                buf=''
                for (y,x,w,h,txt) in r:
                    col=int(x*115)
                    if len(buf) < col: buf += ' '*(col-len(buf))
                    elif buf: buf += '  '
                    buf += txt
                o.write(buf.rstrip()+'\n')
