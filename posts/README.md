# Posts

This directory stores generated drafts and images.

## Structure

```
posts/
├── drafts/     # Generated platform-specific drafts
│   ├── reddit_post.md
│   ├── linkedin_post.md
│   ├── facebook_post.md
│   ├── threads_post.md
│   ├── x_post.md
│   ├── producthunt_post.md
│   ├── hackernews_post.md
│   ├── devto_post.md
│   ├── indiehackers_post.md
│   ├── bluesky_post.md
│   ├── substack_post.md
│   └── medium_post.md
└── images/     # Generated images for posts
```

Each draft includes platform-specific metadata:

```markdown
---
platform: {name}
char_count: {number}
tags: {comma-separated}
method: auto | manual
---
{Content}
```
