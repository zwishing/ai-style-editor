export interface StyleWorkbenchContext {
  activeSourceId: string | null;
  selectedLayerId: string | null;
  revision: number;
  revisionId: string;
}

export type StyleWorkbenchContextPatch = Partial<
  Pick<StyleWorkbenchContext, 'activeSourceId' | 'selectedLayerId'>
>;

const toRevisionId = (revision: number) => `rev-${revision}`;

export const createInitialStyleWorkbenchContext = (): StyleWorkbenchContext => ({
  activeSourceId: null,
  selectedLayerId: null,
  revision: 0,
  revisionId: toRevisionId(0),
});

export const updateStyleWorkbenchContext = (
  context: StyleWorkbenchContext,
  patch: StyleWorkbenchContextPatch
): StyleWorkbenchContext => ({
  ...context,
  ...patch,
});

export const nextStyleRevision = (
  context: StyleWorkbenchContext
): StyleWorkbenchContext => {
  const revision = context.revision + 1;
  return {
    ...context,
    revision,
    revisionId: toRevisionId(revision),
  };
};
