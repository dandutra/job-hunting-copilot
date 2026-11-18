#let r = json("resume.json")
#set document(title: r.title, author: r.name)
#set page(paper: "us-letter", margin: 0.75in, numbering: none)
// Hyphenation and justification stay off so a parser reads whole words in one run.
#set text(font: "Liberation Sans", lang: "en", region: "ca", size: 10.5pt, hyphenate: false)
#set par(justify: false, leading: 0.55em)
#show heading.where(level: 1): set text(size: 16pt)
#show heading.where(level: 2): set text(size: 11.5pt)
// A box cannot break across lines, which keeps a URL whole. Wrapping at a hyphen lost the link in every reader.
#let links(ls) = ls.map(l => box(l)).join(" | ")

= #r.name
#r.details.join(" | ")#if r.links.len() > 0 [ | #links(r.links)]

#let job(j) = [
  #block(above: 0.8em, below: 0.3em)[*#j.title*, #j.org \ #j.location | #j.dates]
  #list(..j.lines.map(l => [#l]))
]

#if r.experience.len() > 0 [
  == Experience
  #for j in r.experience { job(j) }
]
#if r.projects.len() > 0 [
  == Projects
  #for p in r.projects [ #p.name#if p.links.len() > 0 [ | #links(p.links)] \ ]
]
#if r.education.len() > 0 [
  == Education
  #for d in r.education [ *#d.program*, #d.school | #d.dates \ ]
]
#if r.skills.len() > 0 [
  == Skills
  #r.skills.join(", ")
]
#if r.volunteer.len() > 0 [
  == Volunteer Experience
  #for j in r.volunteer { job(j) }
]
