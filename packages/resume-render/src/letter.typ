// The page, font and link rules mirror resume.typ, so a change to one goes to both.
#let r = json("letter.json")
#set document(title: r.title, author: r.name)
#set page(paper: "us-letter", margin: 0.75in, numbering: none)
#set text(font: "Liberation Sans", lang: "en", region: "ca", size: 10.5pt, hyphenate: false)
#set par(justify: false, leading: 0.55em)
#show heading.where(level: 1): set text(size: 16pt)
#let links(ls) = ls.map(l => box(l)).join(" | ")

= #r.name
#r.details.join(" | ")#if r.links.len() > 0 [ | #links(r.links)]

#v(1em)
#r.date \
#r.company

#v(0.5em)
#r.greeting

#r.paragraphs.join(parbreak())

#r.signOff \
#r.name
