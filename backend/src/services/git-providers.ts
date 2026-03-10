import type { OAuthProvider } from "@autosoftware/shared";

interface ProviderRepo {
  id: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  description: string | null;
  isPrivate: boolean;
}

export async function listRemoteRepos(
  provider: OAuthProvider,
  accessToken: string
): Promise<ProviderRepo[]> {
  switch (provider) {
    case "github": {
      const res = await fetch(
        "https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member",
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
      );
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`GitHub API error (${res.status}):`, errorText);
        throw new Error(`Failed to fetch GitHub repos: ${res.status}`);
      }
      const data = await res.json();
      console.log(`GitHub returned ${data.length} repos`);
      return data.map((r: any) => ({
        id: String(r.id),
        fullName: r.full_name,
        cloneUrl: r.clone_url,
        defaultBranch: r.default_branch || "main",
        description: r.description,
        isPrivate: r.private,
      }));
    }
    case "gitlab": {
      const res = await fetch(
        "https://gitlab.com/api/v4/projects?membership=true&order_by=last_activity_at&per_page=100",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error("Failed to fetch GitLab repos");
      const data = await res.json();
      return data.map((r: any) => ({
        id: String(r.id),
        fullName: r.path_with_namespace,
        cloneUrl: r.http_url_to_repo,
        defaultBranch: r.default_branch || "main",
        description: r.description,
        isPrivate: r.visibility === "private",
      }));
    }
    case "bitbucket": {
      const userRes = await fetch("https://api.bitbucket.org/2.0/user", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!userRes.ok) throw new Error("Failed to fetch Bitbucket user");
      const user = await userRes.json();
      const username = user.username;

      const res = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${username}?pagelen=100`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error("Failed to fetch Bitbucket repos");
      const data = await res.json();
      return (data.values || []).map((r: any) => ({
        id: r.uuid,
        fullName: r.full_name,
        cloneUrl: r.links?.clone?.find((c: any) => c.name === "https")?.href || "",
        defaultBranch: r.mainbranch?.name || "main",
        description: r.description,
        isPrivate: r.is_private,
      }));
    }
  }
}

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
      if (!res.ok) throw new Error(`GitHub PR creation failed: ${await res.text()}`);
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
      if (!res.ok) throw new Error(`GitLab MR creation failed: ${await res.text()}`);
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
      if (!res.ok) throw new Error(`Bitbucket PR creation failed: ${await res.text()}`);
      const data = await res.json();
      return { url: data.links?.html?.href || "" };
    }
  }
}
