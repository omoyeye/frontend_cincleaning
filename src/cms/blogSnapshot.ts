import type { BlogPost } from '../../types';

/**
 * Blog data the prerender rendered with. The build embeds the same data as window.__NN_BLOG_POSTS__
 * (blog index) or window.__NN_BLOG_POST__ (an article) so the browser's first render matches the
 * prerendered HTML; fresh data from the API is applied after mount.
 */
let prerenderPosts: BlogPost[] | null = null;
let prerenderPost: BlogPost | null = null;

export function setPrerenderBlog(data?: { posts?: BlogPost[] | null; post?: BlogPost | null } | null): void {
  prerenderPosts = data?.posts ?? null;
  prerenderPost = data?.post ?? null;
}

type BlogWindow = { __NN_BLOG_POSTS__?: BlogPost[]; __NN_BLOG_POST__?: BlogPost };
const win = (): BlogWindow | null => (typeof window === 'undefined' ? null : (window as unknown as BlogWindow));

export function getInitialBlogPosts(): BlogPost[] | null {
  const w = win();
  const posts = w ? w.__NN_BLOG_POSTS__ : prerenderPosts;
  return Array.isArray(posts) ? posts : null;
}

export function getInitialBlogPost(slug: string | null): BlogPost | null {
  if (!slug) return null;
  const w = win();
  const post = w ? w.__NN_BLOG_POST__ : prerenderPost;
  return post && post.slug === slug ? post : null;
}
