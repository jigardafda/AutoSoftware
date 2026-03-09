import type { OAuthProvider } from "@autosoftware/shared";

export async function createPullRequest(
  provider: OAuthProvider,
  accessToken: string,
  repoFullName: string,
  opts: { title: string; body: string; head: string; base: string }
): Promise<{ url: string }> {
  switch (provider) {
    case "github": {
      const res = await fetch(`https://api.github.com/repos/${repoFullName}/pulls`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: opts.title, body: opts.body, head: opts.head, base: opts.base }),
      });
      if (!res.ok) throw new Error(`GitHub PR failed: ${await res.text()}`);
      const data = await res.json();
      return { url: data.html_url };
    }
    case "gitlab": {
      const projectId = encodeURIComponent(repoFullName);
      const res = await fetch(`https://gitlab.com/api/v4/projects/${projectId}/merge_requests`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: opts.title,
          description: opts.body,
          source_branch: opts.head,
          target_branch: opts.base,
        }),
      });
      if (!res.ok) throw new Error(`GitLab MR failed: ${await res.text()}`);
      const data = await res.json();
      return { url: data.web_url };
    }
    case "bitbucket": {
      const res = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${repoFullName}/pullrequests`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: opts.title,
            description: opts.body,
            source: { branch: { name: opts.head } },
            destination: { branch: { name: opts.base } },
          }),
        }
      );
      if (!res.ok) throw new Error(`Bitbucket PR failed: ${await res.text()}`);
      const data = await res.json();
      return { url: data.links?.html?.href || "" };
    }
  }
}
