import type { ResumeData, ResumeSkillUsage } from "@/lib/resume-types";

function shuffle<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function usageIsVisible(
  usage: ResumeSkillUsage,
  visibleProjectIds: Set<string>,
  visibleProjectSlugs: Set<string>,
) {
  if (!usage.projectId && !usage.projectSlug) return true;
  return Boolean(
    (usage.projectId && visibleProjectIds.has(usage.projectId))
    || (usage.projectSlug && visibleProjectSlugs.has(usage.projectSlug)),
  );
}

/**
 * Applies request-scoped presentation rules without mutating the immutable snapshot.
 * Pinned projects keep their exact slots; only rotating slots are shuffled.
 */
export function prepareResumeForPresentation(data: ResumeData, random: () => number = Math.random): ResumeData {
  const visibleProjects = data.projects.filter((project) => project.displayMode !== "HIDDEN");
  const rotating = shuffle(visibleProjects.filter((project) => project.displayMode === "ROTATING"), random);
  let rotatingIndex = 0;
  const projects = visibleProjects.map((project) => (
    project.displayMode === "PINNED" ? project : rotating[rotatingIndex++]
  ));
  const visibleProjectIds = new Set(projects.map((project) => project.id));
  const visibleProjectSlugs = new Set(projects.map((project) => project.slug));
  const skills = data.skills.map((skill) => {
    const usages = skill.usages.filter((usage) => usageIsVisible(usage, visibleProjectIds, visibleProjectSlugs));
    return {
      ...skill,
      usages,
      count: new Set(usages.map((usage) => usage.experienceId ?? usage.projectId ?? usage.projectSlug).filter(Boolean)).size,
    };
  });

  return { ...data, projects, skills };
}
