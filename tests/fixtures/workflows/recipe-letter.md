# Recipe letter

Northwind Bakery's weekly recipe newsletter: a seasonal recipe, photos, the letter, a proofread, send. Recipe-led; every quantity is tested.

when: manual · "send the recipe letter" · every Monday 09:00 · or a Codex task
folder: ~/Coding/acme/site
on failure: stop and tell the user

## 1. Research → Research Agent
Find three seasonal recipes the bakery has not featured yet: the bakers' notebook, last week's sales, what customers asked for. Every recipe with a verbatim quote from the notebook, its page and date; labelled tested, untested or idea.
in: the last 7 days
out: research/shortlist.md, recipes ranked by season
then: done → Photos · nothing seasonal this week → stop, tell the user

## 2. Photos → Photo Agent
Pick the best photos of the chosen recipe from the bakery's library, with SHA256 and the photographer's credit.
in: the ranked recipes
out: photos/*.jpg, photos/CREDITS.md
then: done → Draft

## 3. Draft & layout → Writer Agent
Write the letter in the house format (formats/letter.md): the recipe first, one short story from the kitchen at most, about 400 words.
in: shortlist + photos, formats/letter.md
out: DRAFT.md, layout.html, plain.txt
then: done → Edit

## 4. Edit → Editor Agent
Check every quantity and the tone; propose three subject lines and a preview text.
in: the draft
out: edit/notes.md, three subject lines, preview.txt
then: done → Preview

## 5. Preview → Mail Agent
Build the email with the chosen subject line and send a test copy.
in: the layout, the chosen subject line and preview text
out: previews/letter-NNN.html
then: done → Your approval · failed → retry once, then stop and tell the user

## 6. Your approval → you
Read it. Nothing is sent before you approve; send it back to any step with notes.
then: approved → Send · changes requested → back to step 3 with your notes

## 7. Send → Mail Agent
Send it to the subscribers and post the recipe on the site, with the photos; report every link.
in: the approved letter, photos
out: sent.md with every link
then: → Done

done: the links, by voice if the user is around
