import { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';

export interface IIndexMapping {
  getMapping(): MappingTypeMapping;
}