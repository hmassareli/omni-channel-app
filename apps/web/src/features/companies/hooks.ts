import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as api from "../../lib/api";

export const companyKeys = {
  all: ["companies"] as const,
  list: (search: string) => ["companies", "list", search] as const,
  detail: (id: string) => ["companies", "detail", id] as const,
  timeline: (id: string) => ["companies", "timeline", id] as const,
};

const PAGE_SIZE = 50;

/** Lista paginada ("carregar mais") de empresas com busca. */
export function useInfiniteCompanies(search: string) {
  return useInfiniteQuery({
    queryKey: companyKeys.list(search),
    queryFn: ({ pageParam }) =>
      api.getCompanies({
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.pagination.hasMore
        ? last.pagination.offset + last.pagination.limit
        : undefined,
    placeholderData: keepPreviousData,
  });
}

/** Empresas para selects (até 100). */
export function useCompanyOptions() {
  return useQuery({
    queryKey: [...companyKeys.all, "options"],
    queryFn: () => api.getCompanies({ limit: 100 }),
    select: (data) => data.companies,
  });
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: companyKeys.detail(id ?? ""),
    queryFn: () => api.getCompany(id!),
    enabled: !!id,
  });
}

export function useCompanyTimeline(id: string | undefined) {
  return useQuery({
    queryKey: companyKeys.timeline(id ?? ""),
    queryFn: () => api.getCompanyTimeline(id!),
    enabled: !!id,
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createCompany,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: companyKeys.all }),
  });
}
