# Streak community publishing pack

31 October 2026. Prepared locally; no issue comment or forum topic has been posted.

## Open the drafts and gallery

- [GitHub issue update](github-issue-update.md): engineering journey and acceptance evidence.
- [Nervos Talk introduction](nervos-talk.md): prediction-first introduction for potential users.
- [Nervos Talk text-only fallback](nervos-talk-text-only.md): the introduction without links, images or gallery captions, for accounts currently restricted from including them.
- [Formatted copy page](copy-ready.html): copy the post body as formatted text for the rich-text editor.
- [Desktop/mobile gallery](gallery.html): inspect five paired views and open full-resolution originals. The main prediction journey comes first, followed by Five and Survivor.

The same screen is shown on desktop and mobile in each PNG. Upload the paired PNG,
not two separate images: the side-by-side composition then survives forum rendering.

## Images ready to upload

Open the [upload-images folder](upload-images/) for just the five final PNGs, or
[download the image ZIP](streak-upload-images.zip) and extract it. Upload the PNGs
to the post, not the ZIP itself.

| Order | Image                                                            | Story                                             |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------- |
| 1     | [01-markets.png](upload-images/01-markets.png)                   | Lead with the prediction market                   |
| 2     | [02-payment-tracking.png](upload-images/02-payment-tracking.png) | Desktop payment status and mobile three-cell blob |
| 3     | [03-activity.png](upload-images/03-activity.png)                 | Prediction history and available returns          |
| 4     | [04-streak-five.png](upload-images/04-streak-five.png)           | Five's weekly fantasy squad                       |
| 5     | [05-streak-survivor.png](upload-images/05-streak-survivor.png)   | Survivor's competition and team selection         |

In the forum or GitHub image picker, paste this folder path into the address bar:

```text
C:\Users\HP\Desktop\ckb\reports\community\upload-images
```

Choose the PNG whose name matches the image placeholder. Repeat at the other four
positions and retain their captions. The upload copies match the originals; the
ZIP contains only those five images at its root.

All screenshots use the actual built application with isolated sample data.
The payment is simulated, and no screenshot proves a live transaction, production
liquidity, user adoption or a paid prize. The games also use isolated sample data.
Keep the captions. Capture sources and checks are recorded separately for the
[prediction journey](../assets/community-2026-10-31/raw/capture-provenance.json),
[Five](../assets/community-2026-10-31/raw/five-capture-provenance.json) and
[Survivor](../assets/community-2026-10-31/raw/survivor-capture-provenance.json).

## GitHub issue

1. Copy the contents of `github-issue-update.md` into the intended issue comment.
2. At each image line, replace the local Markdown image reference by dragging the
   corresponding paired PNG into the comment box. GitHub uploads the file and
   inserts its own hosted image URL. Keep the caption underneath.
3. Use **Preview** to check all five images, then submit when ready.

This works in an issue in another repository too, subject to that repository's
permissions. It requires no image-hosting account or repository push. Do not paste
Windows paths or invent `raw.githubusercontent.com` links for unpublished files.
GitHub supports PNG uploads up to 10 MB, and public-repository attachments are
publicly accessible. [Official attachment instructions](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files).

The installed GitHub CLI does not expose the newer `--attach` option. Browser
attachment is the supported method for this pack.

## Nervos Talk

1. Create a topic in [Applications & Ecosystem](https://talk.nervos.org/c/applications-ecosystem/70).
2. Put the first heading from `nervos-talk.md` in the separate topic title field,
   without its leading `#`.
3. In the composer toolbar, select the leftmost **Markdown icon** (the small
   **M with a down arrow**, immediately beside **A**). The **A** button selects
   rich text; pasting Markdown there can leave the formatting characters visible.
4. Select and replace the existing post body with the cleaned contents of
   `nervos-talk.md`, starting at “Home win” and excluding the title. If a previous
   paste showed literal Markdown, paste again after selecting Markdown mode:
   switching modes alone can preserve that text as escaped content.
5. Replace each local Markdown image line with the corresponding paired PNG using
   the image-upload control or drag and drop. Keep the caption underneath and
   inspect the preview. The editor supplies its own hosted image references.
6. Publish when ready. Add the resulting topic link to the GitHub issue afterward.

If you prefer to stay in **A / rich-text mode**, open the
[formatted copy page](copy-ready.html), copy the Nervos Talk body using its copy
button, and paste it into an empty composer. Set the title separately and upload
the five PNGs at the indicated image positions. Image files still need to be
uploaded to the forum; copying formatted text does not host them.

Discourse supports both Markdown and rich-text composition. These instructions
follow its [official composer guide](https://meta.discourse.org/t/introducing-our-new-composer-making-writing-on-discourse-easier-than-ever/369779)
and the editor shown in the owner's screenshot. No topic has been posted or
tested in the live Nervos Talk composer as part of this pack.

The local image references in both drafts work for local Markdown preview. They
must be replaced by the attachment URLs supplied by each site's editor before
posting. Publishing instructions belong in this README; the drafts contain no
editorial HTML comments.

## When the forum rejects links and images

The errors “you can't embed media items” and “you can't include links” indicate
posting permissions. Changing editor mode or resizing the PNGs does not grant
those permissions. Discourse checks allowed groups for embedded media and link
permissions in its [post validator](https://github.com/discourse/discourse/blob/main/lib/validators/post_validator.rb).

For this introduction, preserve the complete draft and ask a
[Nervos Talk moderator](https://talk.nervos.org/about) to review the account's
posting permissions before publishing the full showcase. Suggested request:

> I'm preparing a Streak project introduction, but my account cannot include links
> or screenshots. Could you please review my posting permissions? My forum
> username is [username].

If you prefer to post text first, use the **Nervos Talk: text only** tab on the
[copy page](copy-ready.html). Replace the entire existing composer body so old
image uploads and hyperlinks are removed. The fallback includes neither links
nor images; other account restrictions may still apply. The original full draft
and five images remain ready for a later edit, subject to forum permissions.

Nervos Talk's exact account settings have not been inspected. Discourse supports
custom group permissions and configurable trust thresholds, so there is no
verified promise that a fixed amount of reading will unlock this account.
[Official trust and group-permission explanation](https://blog.discourse.org/2018/06/understanding-discourse-trust-levels/).

## Release status

The latest verified runtime is commit `948fb1c`, with evidence recorded in
`cc994c6`. All 77 required checks passed locally. Those commits have not been
pushed or deployed at the time this pack was prepared. The drafts preserve that
distinction, especially for Survivor creator prizes and Five's newest live-team view.
Update the wording only after the deployed revision has been verified.

No app implementation changes, wallet approvals or fund movements are part of this
publishing pack. The earlier Week 22 screenshots and report remain unchanged.

## Capture and export checks

The full gallery uses ten original captures: a desktop and mobile view for each
of the three prediction screens and the two games. All use 1440 × 1000 and
390 × 844 viewports. Activity, Five and Survivor use normal page scrolling where
needed to show the return card, full squad or team choices. All capture journeys
finished without page errors or external network requests.

All five paired PNGs are 1920px wide and below 1.2 MB. Their images loaded,
the gallery had no horizontal overflow at 390px or 1440px, and the boards were
visually inspected. All five upload copies match their source hashes, and the
ZIP contains exactly those five images.
See the individual capture records above and the
[composition results](../assets/community-2026-10-31/gallery-validation.json).

Local reproduction commands:

```powershell
node --require ./scripts/quality/test-env.cjs .quality-artifacts/community-gallery-capture.cjs
node .quality-artifacts/community-export.cjs
```

These local capture helpers are ignored working artifacts. The publishing pack
retains the source images, hashes, provenance and gallery HTML for inspection.
