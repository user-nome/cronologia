export type WorkType = 'webtoon' | 'manhwa' | 'manhua' | 'manga' | 'livro' | 'outro';

export type WorkStatus = 'planejado' | 'lendo' | 'pausado' | 'concluido' | 'cancelado';

export interface Work {
  id: string;
  title: string;
  synopsis: string;
  type: WorkType;
  status: WorkStatus;
  /** Progresso de leitura em capítulos, apenas valores >= 0 (sem limite superior) */
  progress: number;
  /** Indicação livre, ex.: "Cap. 45", "Vol. 3" */
  marker?: string | undefined;
  /** Nome do arquivo da capa dentro da pasta de capas */
  coverFile?: string | undefined;
  /** Categoria principal da obra, ex.: 'Isekai' */
  category?: string | undefined;
  /** Data de início da leitura (ISO 8601) */
  startedAt?: string | undefined;
  /** Data de conclusão da leitura (ISO 8601) */
  finishedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

/**
 * Obra como o formulário entrega ao `save`: os campos editáveis e os
 * timestamps opcionais (o main carimba quando eles faltam).
 */
export type WorkDraft = Omit<Work, 'createdAt' | 'updatedAt'> &
  Partial<Pick<Work, 'createdAt' | 'updatedAt'>>;
