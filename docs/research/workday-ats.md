# Workday Recruiting: how resumes are parsed, seen, searched and graded

Researched 2026-11-06. Scope: Workday Recruiting career sites (`*.myworkdayjobs.com`, `*.myworkdaysite.com`) and HiredScore, the AI grading product Workday bought in 2024. Each claim links to its source. Workday's own documentation and court filings are primary. Vendor and resume-builder blogs are labelled low-trust where used. "Unverified" means no primary source was found.

## Answer

What a candidate should do for a Workday posting, given the evidence below.

Do:

- Submit a text-based PDF or a DOCX. Workday's parser and HiredScore both accept DOC, DOCX, PDF, RTF and TXT ([Workday admin guide](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/candidate-skills-match/bmj1604095304483.html), [HiredScore docs](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/concept--candidate-profiles.html)). Check that the text can be selected and copied in the PDF, because image content parses badly ([Workday admin guide](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/set-up-prospects-and-candidates/hdc1552497830785.html)).
- Use one column, plain text, and no images, icons, text boxes or tables. Workday says parsing "can vary based on resume format and order of words" and that image-based styles are less likely to parse well ([Workday admin guide](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/set-up-prospects-and-candidates/hdc1552497830785.html)).
- Use standard headings: Experience (or Work Experience), Education, Skills, Certifications. HiredScore evaluates each qualification against parsed sections for experience, education, skills and certifications ([HiredScore release note, Aug 2026](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/hiredscore-release-notes/2026/august/wednesday--5th-august.html)). That exact heading list is a convention, not a documented parser rule.
- Give each job a title, an employer and a start and end date on predictable lines. HiredScore computes "employment gaps and time in position" from the parsed resume ([HiredScore docs](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/concept--candidate-profiles.html)), so dates it cannot read can show up as gaps.
- Put name, email, phone and city in the body of the page, not in a header or footer. No Workday source says headers are skipped (unverified). The form asks for the same data anyway, so nothing is lost by putting it in the body.
- Mirror the posting's required qualifications in plain words, with the exact skill names it uses. HiredScore grades A/B versus C/D on whether "basic qualifications" are met, judged against the parsed resume ([HiredScore release note](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/hiredscore-release-notes/2026/august/wednesday--5th-august.html), [grade definitions](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/reference%2D%2Dcandidate-grades.html)). Workday's Candidate Skills Match weights the requisition's required skills more heavily ([Workday admin guide](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/candidate-skills-match/bmj1604095304483.html)).
- After "Autofill with Resume", check every field and fix it by hand. Workday does not autofill Skills or Languages from the resume ([Workday admin guide](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/set-up-prospects-and-candidates/hdc1552497830785.html)), so type the posting's skills into the Skills field yourself.
- Answer screening questions with care. They are the most likely place for a rule-based rejection, because employers configure dispositions with condition rules ([Workday admin guide, dispositions example](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/prospect-and-candidate-management/example--automatically-decline-remaining-candidate.html)). How knockout answers dispose of a candidate in a given tenant is unverified.

Don't:

- Don't use two-column layouts, sidebars, skill bars, graphics or photos.
- Don't stuff keywords or hide white text. The recruiter can open and keyword-search the original file ([HiredScore docs](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/concept--candidate-profiles.html)), so hidden text is one search away from being found. HiredScore says it reads candidate data "at face value" and does not derive new features ([Workday datasheet, 2026](https://www.workday.com/content/dam/web/en-us/documents/datasheets/responsible-ai-with-hiredscore-datasheet-enus.pdf)). No source shows that repeating a term raises a grade (unverified either way).
- Don't skip the resume upload. HiredScore assigns no grade when there is no resume or the format is unsupported ([HiredScore Spotlight docs](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/concept--spotlight.html)), and ungraded candidates sort below graded ones when a recruiter sorts by grade.
- Don't build the resume around the "75% rejected by ATS" claim. It has no traceable study behind it (see the myths section).

## 1. Parsing on apply

Facts from Workday:

- Workday's admin guide says resume parsing "populates fields from a resume" for prospects and job applications. It does not autofill hidden fields, Languages or Skills. "Resume parsing results can vary based on resume format and order of words", and resumes with images or image-based styles are less likely to parse well ([Workday admin guide, updated 2023-06-23](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/set-up-prospects-and-candidates/hdc1552497830785.html)). Employers can hide parsing from external candidates in the application template ([same page](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/set-up-prospects-and-candidates/hdc1552497830785.html)), so "Autofill with Resume" may not appear on every career site.
- File types: Workday "processes applicant resumes" in DOC, DOCX, HTM, HTML, PDF, RTF and TXT for Candidate Skills Match ([Workday admin guide](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/candidate-skills-match/bmj1604095304483.html)). HiredScore supports DOC, DOCX, PDF, RTF and TXT ([HiredScore docs](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/concept--candidate-profiles.html)).
- Parsing can break at the tenant level. A University of Nevada Workday status post records career-site resume parsing as "not functional" and then resolved ([UNR Workday notice](https://workday.nevada.edu/?p=3262)).

Not documented by Workday (unverified):

- File size limit. A 5 MB cap is widely repeated, but only by low-trust blogs ([jobshinobi, low-trust](https://jobshinobi.com/blog/how-to-optimize-resume-for-workday-ats)). It is set per tenant. Read the upload widget on the actual posting.
- Behaviour with multi-column layouts, tables, headers and footers, and icons. Workday says only that format and word order affect results and that images hurt. Specific claims about columns and tables come from vendor blogs, for example Teal's report that autofill often mangles Work Experience ([Teal, low-trust](https://www.tealhq.com/post/workday-resume)).
- Which date formats parse best. No Workday source. "Mon YYYY to Mon YYYY" or "MM/YYYY" on the same line as the job is common practice, but this is folklore.
- The parsing engine. Workday does not name a vendor. A Textkernel or RChilli link appears only in partner marketing (unverified).

## 2. What recruiters see

- HiredScore shows a "parsed, or smart, resume" in a Parsed CV section, in the same format for every candidate. It computes employment gaps and time in position. An Attachments tab lets the recruiter download the original files and "search for keywords in a candidate's original resume" ([HiredScore docs](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/concept--candidate-profiles.html)).
- In core Workday Recruiting, the candidate record has an Attachments tab and a Questionnaire Results tab, and recruiters review candidates "including viewing Resume attachments" ([Salt Lake City Workday job aid](https://www.slcdocs.com/WorkdayERP/phaseHR/MngeCandidates-JA.pdf)).
- So both the parsed profile and the original file are in front of the recruiter. Whether a given recruiter opens the PDF is unverified and varies. The original file is what a human reads, so it must also look good to a person.

## 3. Search, ranking and grading

Search:

- Workday's global search uses a `cand:` prefix for candidate name, ID or email ([Workday admin guide](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/recruiting-setup/mya1532427753547.html)). Whether core Find Candidates searches full resume text is not documented publicly (unverified).
- HiredScore Global Talent Search filters past applicants by name, location, years of experience, skills, education level, language, major, prior applications and prior employers ([HiredScore docs](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/concept--global-talent-search.html)). These are parsed fields, which is another reason clean parsing matters. Its "Fetch" feature recommends up to 4 matching requisitions per candidate ([same page](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/concept--global-talent-search.html)).

HiredScore grading (Spotlight):

- Workday signed the HiredScore deal on 2024-02-23 ([Workday 8-K](https://www.sec.gov/Archives/edgar/data/1327811/000132781124000032/wday-20240223.htm)). A close on 2024-03-29 for about USD 530 million is reported only by a secondary source ([MarketScreener](https://in.marketscreener.com/quote/stock/WORKDAY-INC-37866670/news/Workday-Inc-completed-the-acquisition-of-HiredScore-Inc-for-approximately-530-million-46816907)).
- Grades run from A to D. A means all basic (required) qualifications and most preferred ones are met, with an average match above a threshold. B means all basic qualifications are met. C means most but not all. D means most are not met ([HiredScore grade reference](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/reference%2D%2Dcandidate-grades.html)).
- Inputs: grades reflect "how well their resumes match the qualifications specified in the job description." There is no grade when the candidate has no resume, the format is unsupported, the requisition has no job description, or the requisition is campus or graduate ([Spotlight docs](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/concept--spotlight.html)). Since August 2026 each screenable qualification is evaluated "individually against the candidate's parsed resume", with plain-language explanations in a Fit & Gap view ([release note](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/hiredscore-release-notes/2026/august/wednesday--5th-august.html)).
- Use: recruiters sort the grade column so "the most qualified" come first and filter by grade. Workday's own example has a recruiter screening a C candidate ([Spotlight docs](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/concept--spotlight.html)). The grade orders the queue. It does not reject on its own.
- Workday's stated exclusions: no university names, hobbies or extracurriculars; no exact address, only bucketed commute distance; no demographic data or correlated features. It also says HiredScore does not "automate employment decisions" ([Workday datasheet, 2026](https://www.workday.com/content/dam/web/en-us/documents/datasheets/responsible-ai-with-hiredscore-datasheet-enus.pdf)). These are vendor claims.
- Pfizer's NYC Local Law 144 bias audit says each grade is independent of the rest of the pool and that recruiters keep "complete discretion" ([Pfizer audit summary](https://cdn.pfizer.com/pfizercom/2026-05/Pfizer-Bias-Audit-Summary-of-the-Hired-Score-Grade-System29MAY26.pdf)). Workday's own audit of its internal Spotlight use found no disparate impact, for US applicants in the New York City area only ([Workday bias audit page](https://www.workday.com/en-us/legal/responsible-ai-and-bias-mitigation.html)).

Candidate Skills Match (core Workday Recruiting):

- Candidate Skills Match uses machine learning to rate Strong, Good, Fair, Low, Pending or Unable to Score. It draws Skills Cloud skills from the application and resume and from the requisition, and weights required skills more. It ignores how recent a skill is, how long it was used, and total years of experience. Workday plans to retire it ([Workday admin guide](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/candidate-skills-match/bmj1604095304483.html)).

Canada:

- HiredScore is sold on Workday's Canadian site ([workday.com/en-ca](https://workday.com/en-ca/products/talent-management/ai-recruiting.html)). Whether a given Canadian employer has it switched on is unverified. No public source says so.
- Since 2026-01-01, Ontario employers with 25 or more employees must state in a public job posting whether AI is used to screen, assess or select applicants ([Littler](https://www.littler.com/news-analysis/asap/canada-new-ontario-job-posting-requirements-force-january-1-2026)). For an Ontario posting, the posting text is the best available signal.

## 4. Myths and evidence

"75% of resumes are rejected by ATS":

- CNBC in 2019 wrote that three-fourths of resumes are never seen by a human, "according to a study from job search services firm Preptel", with no date or method ([CNBC](https://www.cnbc.com/2019/02/28/resume-how-yours-can-beat-the-applicant-tracking-system.html)).
- HR consultant Christine Assaf traced the claim through TopResume, a 2014 Forbes piece that cited no one, and CNBC. She found that Preptel closed in August 2013 and that no study exists. She concluded that ATS "screen applicants – they do not reject them" ([Assaf, HRTact, 2020](https://hrtact.com/2020/10/05/your-job-application-was-rejected-by-a-human-not-a-computer/)). The 75% figure has no traceable source.

"ATS auto-rejects":

- Partly true, through configured rules. The Harvard Business School and Accenture "Hidden Workers" study (2021) found employers using filters such as excluding applicants with work-history gaps of over about six months. Co-author Joseph Fuller said about half of US companies have such a filter ([Harvard Gazette interview](https://news.harvard.edu/gazette/story/2021/09/new-study-says-hidden-workers-are-being-excluded/)). These are rules the employer configures, not resume formatting.
- Mobley v. Workday (N.D. Cal., No. 3:23-cv-00770). In the 2025 certification order the court is describing allegations, not findings. The complaint quotes Workday's site as able to "reduce time to hire by automatically dispositioning or moving candidates forward". The opt-in plaintiffs each allege at least one "automated" rejection email for jobs they were qualified for ([Order, 2025-05-16, Dkt. 128](https://storage.courtlistener.com/recap/gov.uscourts.cand.408645/gov.uscourts.cand.408645.128.0.pdf)). The court preliminarily certified an age (ADEA) collective of applicants aged 40 and over since 2020-09-24. It said Workday can later seek decertification ([same order](https://storage.courtlistener.com/recap/gov.uscourts.cand.408645/gov.uscourts.cand.408645.128.0.pdf)). It later ruled that applicants scored or ranked by HiredScore Spotlight and Fetch are in the collective ([Order, 2025-07-29, Dkt. 158](https://storage.courtlistener.com/recap/gov.uscourts.cand.408645/gov.uscourts.cand.408645.158.0.pdf)). Nothing has established that Workday software rejects candidates. A class certification motion on other claims is reported as pending, with a hearing in March 2027 ([OpenClassActions, secondary](https://openclassactions.com/lawsuits/consumer-protection/workday-ai-hiring-discrimination-class-action-lawsuit.php)). Check the docket for current status.
- Workday's position, as reported: its AI "does not make hiring decisions and is not designed to automatically reject candidates" ([UC Today quoting Kelly Trindel](https://www.uctoday.com/talent-hcm-platforms/workday-faces-landmark-lawsuit-over-ai-hiring-feature-what-hr-leaders-need-to-know/)). A spokesperson called the claims false ([ITPro](https://www.itpro.com/technology/artificial-intelligence/the-claims-in-the-suit-are-false-workday-hits-back-amid-lawsuit-claiming-ai-recruitment-discrimination)). No Workday newsroom statement was found.

Keyword stuffing and white text:

- No primary source shows either one working in Workday. The original file is keyword-searchable by recruiters ([HiredScore docs](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/concept--candidate-profiles.html)). Parsed text drops formatting, so white text may appear as visible text in the parsed profile. That last point is an inference and is unverified.
- What does help is required qualifications stated in words the parser can match. Grades hinge on basic qualifications ([release note](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/hiredscore-release-notes/2026/august/wednesday--5th-august.html)), and the HBS study notes candidates are missed when their wording does not match the terms employers search for ([Harvard Gazette](https://news.harvard.edu/gazette/story/2021/09/new-study-says-hidden-workers-are-being-excluded/)).

## 5. Formatting guidance that follows

| Choice | Do | Evidence |
| --- | --- | --- |
| File | Text-based PDF or DOCX, under the size shown on the upload widget | Supported types ([Workday](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/candidate-skills-match/bmj1604095304483.html)); size limit unverified |
| Layout | One column, no tables, text boxes, icons or images | Format and word order affect parsing; images hurt ([Workday](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/set-up-prospects-and-candidates/hdc1552497830785.html)) |
| Headings | Experience, Education, Skills, Certifications | Parsed sections used in grading ([HiredScore](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/hiredscore-release-notes/2026/august/wednesday--5th-august.html)); exact headings are convention |
| Dates | Month and year for start and end, on each role | Gaps and tenure are computed ([HiredScore](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/concept--candidate-profiles.html)); best format unverified |
| Contact | In the body, top of page 1 | Header and footer handling unverified |
| Skills | Posting's exact skill names, in a Skills section and in role bullets; also type them into the form's Skills field | Skills are not autofilled; required skills weigh more ([Workday](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/candidate-skills-match/bmj1604095304483.html)) |
| Qualifications | State each "required" item from the posting plainly if it is true | A/B versus C/D split on basic qualifications ([HiredScore](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/hiredscore-release-notes/2026/august/wednesday--5th-august.html)) |

## Open questions

- The candidate-side upload size limit and the parser vendor.
- Whether core Workday Find Candidates searches full resume text.
- Whether a given employer uses HiredScore or Candidate Skills Match. An Ontario posting's AI disclosure line would answer part of this.
