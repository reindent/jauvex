# News video

The weekly "what's new in AI" video: research, assets, the news format, render, publish. Demo-led; truth is the hard constraint.

when: manual · "run the news video" · every Monday 09:00 · or a Codex task
folder: ~/Coding/acme/site
on failure: stop and tell the user

## 1. Research → Social Media Agent
Find what was hot in AI in the last 7 days: X, the vendors' blogs, independent tests. Every claim with a verbatim quote, URL and date; labelled vendor claim, independent test or impression.
in: the last 7 days
out: research/brief.md, stories ranked by demo footage
then: done → Assets · nothing usable this week → stop, tell the user

## 2. Assets → Social Media Agent
Download the best demo clips, vendor originals or independent tests, with SHA256 and exact source windows.
in: the ranked stories
out: source-video/*.mp4, source-video/HANDOFF.md
then: done → Script

## 3. Script & assembly → Video Agent
Write the script and the timeline in the news format (formats/news.md): hook first, demo-led, one short item at most for papers, about 5 minutes.
in: brief + assets, formats/news.md
out: SCRIPT.md, timeline.json, captions.srt
then: done → Creative review

## 4. Creative review → Creative Agent
Review the timeline for pace and hook; propose three hook variants and a thumbnail.
in: the timeline
out: creative/notes.md, three hook variants, thumbnail.png
then: done → Render

## 5. Render → Video Agent
Render 1080p with the chosen hook and thumbnail.
in: the timeline, the chosen hook and thumbnail
out: renders/news-NNN.mp4
then: done → Your approval · failed → retry once, then stop and tell the user

## 6. Your approval → you
Watch it. Nothing is published before you approve; send it back to any step with notes.
then: approved → Publish · changes requested → back to step 3 with your notes

## 7. Publish → Social Media Agent
YouTube, X, LinkedIn, TikTok with the captions; report every link.
in: the approved render, captions
out: published.md with every link
then: → Done

done: the links, by voice if the user is around
