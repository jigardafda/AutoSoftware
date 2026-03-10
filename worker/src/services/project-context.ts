import { prisma } from "../db.js";

const MAX_CONTEXT_LENGTH = 50_000;

export async function getProjectContext(repoId: string, projectId?: string | null): Promise<string> {
  // If a specific projectId is given, fetch that project's documents
  // If no projectId, fetch documents from ALL projects containing this repo
  // Return empty string if no documents found
  // Format as markdown sections labeled by project name and document title
  // Truncate at MAX_CONTEXT_LENGTH chars

  let projects: Array<{ name: string; documents: Array<{ title: string; content: string }> }> = [];

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        documents: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (project && project.documents.length > 0) {
      projects.push({ name: project.name, documents: project.documents });
    }
  } else {
    // Find all projects containing this repo
    const projectRepos = await prisma.projectRepository.findMany({
      where: { repositoryId: repoId },
      include: {
        project: {
          include: {
            documents: {
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });
    for (const pr of projectRepos) {
      if (pr.project.documents.length > 0) {
        projects.push({ name: pr.project.name, documents: pr.project.documents });
      }
    }
  }

  if (projects.length === 0) return "";

  let context = "# Project Context\n\n";
  context += "The following context documents have been provided by the user to guide your analysis. Pay close attention to these requirements and goals:\n\n";

  for (const project of projects) {
    context += `## Project: ${project.name}\n\n`;
    for (const doc of project.documents) {
      context += `### ${doc.title}\n\n${doc.content}\n\n`;
    }
  }

  if (context.length > MAX_CONTEXT_LENGTH) {
    context = context.slice(0, MAX_CONTEXT_LENGTH) + "\n\n[Context truncated due to length]";
  }

  return context;
}
