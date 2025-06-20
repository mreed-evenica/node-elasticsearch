import { MappingProperty } from '@elastic/elasticsearch/lib/api/types';

type NumberFieldType = 'integer' | 'long' | 'float' | 'double';
type NestFieldType = 'nested' | 'object';
class MappingHelpers {
  static textField(analyzer?: string): MappingProperty {
    return {
      type: 'text' as const,
      ...(analyzer && { analyzer })
    };
  }

  static keywordField(ignoreAbove = 256): MappingProperty {
    return {
      type: 'keyword' as const,
      ignore_above: ignoreAbove
    };
  }

  static textWithKeyword(analyzer?: string): MappingProperty {
    return {
      type: 'text' as const,
      ...(analyzer && { analyzer }),
      fields: {
        keyword: this.keywordField()
      }
    };
  }

  static disabledField(): MappingProperty { 
    return {
        type: 'object' as const,
        enabled: false
    }
  }

  static dateField(format?: string): MappingProperty {
    return {
      type: 'date' as const,
      ...(format && { format })
    };
  }

  static numberField(type: NumberFieldType): MappingProperty { 
    switch (type) { 
        case 'integer':
            return { type: 'integer' as const };
        case 'long':
            return { type: 'long' as const };
        case 'float':
            return { type: 'float' as const };
        case 'double':
            return { type: 'double' as const };
        default:
            throw new Error(`Unsupported number type: ${type}`);
    }
  }

  static booleanField(): MappingProperty { 
    return {
      type: 'boolean' as const
    };
  }
}

export default MappingHelpers;