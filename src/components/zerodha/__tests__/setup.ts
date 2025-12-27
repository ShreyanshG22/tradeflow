/**
 * Test Setup for Zerodha Components
 * Configures testing environment and mocks
 */

import { vi } from 'vitest';

// Mock React Router
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

// Mock React Hook Form
vi.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    handleSubmit: (fn: Function) => (e: Event) => {
      e.preventDefault();
      fn({});
    },
    formState: { errors: {} },
    watch: () => ({}),
    reset: vi.fn(),
    setValue: vi.fn(),
    getValues: vi.fn(),
  }),
  Controller: ({ render }: { render: Function }) => render({
    field: {
      onChange: vi.fn(),
      onBlur: vi.fn(),
      value: '',
      name: 'test',
      ref: vi.fn(),
    },
    fieldState: {
      invalid: false,
      isTouched: false,
      isDirty: false,
      error: undefined,
    },
  }),
}));

// Mock Zod
vi.mock('zod', () => ({
  z: {
    object: () => ({
      parse: vi.fn(),
      safeParse: vi.fn(() => ({ success: true, data: {} })),
    }),
    string: () => ({
      min: () => ({
        email: () => ({}),
      }),
    }),
    number: () => ({
      min: () => ({}),
      optional: () => ({}),
    }),
    enum: () => ({
      default: () => ({}),
    }),
  },
}));

// Mock @hookform/resolvers/zod
vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => vi.fn(),
}));

// Mock Sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock Lucide React icons
vi.mock('lucide-react', () => {
  const MockIcon = ({ className, ...props }: any) => (
    <svg className={className} {...props} data-testid="mock-icon" />
  );
  
  return new Proxy({}, {
    get: () => MockIcon,
  });
});

// Mock UI components
vi.mock('../../ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="card">{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-header">{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <h3 data-testid="card-title">{children}</h3>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-content">{children}</div>
  ),
}));

vi.mock('../../ui/button', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: any) => (
    <button 
      onClick={onClick} 
      disabled={disabled} 
      className={className}
      data-testid="button"
      {...props}
    >
      {children}
    </button>
  ),
}));

vi.mock('../../ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className} data-testid="badge">{children}</span>
  ),
}));

vi.mock('../../ui/input', () => ({
  Input: ({ className, ...props }: any) => (
    <input className={className} data-testid="input" {...props} />
  ),
}));

vi.mock('../../ui/label', () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor} data-testid="label">{children}</label>
  ),
}));

vi.mock('../../ui/select', () => ({
  Select: ({ children, onValueChange, defaultValue }: any) => (
    <div data-testid="select" onClick={() => onValueChange?.('test')}>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid="select-item" data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-trigger">{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span data-testid="select-value">{placeholder}</span>
  ),
}));

vi.mock('../../ui/form', () => ({
  Form: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="form">{children}</div>
  ),
  FormControl: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="form-control">{children}</div>
  ),
  FormField: ({ render }: { render: Function }) => render({
    field: {
      onChange: vi.fn(),
      onBlur: vi.fn(),
      value: '',
      name: 'test',
      ref: vi.fn(),
    },
  }),
  FormItem: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="form-item">{children}</div>
  ),
  FormLabel: ({ children }: { children: React.ReactNode }) => (
    <label data-testid="form-label">{children}</label>
  ),
  FormMessage: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="form-message">{children}</div>
  ),
}));

vi.mock('../../ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div className={className} data-testid="skeleton" />
  ),
}));

vi.mock('../../ui/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => (
    <table data-testid="table">{children}</table>
  ),
  TableHeader: ({ children }: { children: React.ReactNode }) => (
    <thead data-testid="table-header">{children}</thead>
  ),
  TableBody: ({ children }: { children: React.ReactNode }) => (
    <tbody data-testid="table-body">{children}</tbody>
  ),
  TableRow: ({ children }: { children: React.ReactNode }) => (
    <tr data-testid="table-row">{children}</tr>
  ),
  TableHead: ({ children }: { children: React.ReactNode }) => (
    <th data-testid="table-head">{children}</th>
  ),
  TableCell: ({ children }: { children: React.ReactNode }) => (
    <td data-testid="table-cell">{children}</td>
  ),
}));

vi.mock('../../ui/progress', () => ({
  Progress: ({ value, className }: { value: number; className?: string }) => (
    <div className={className} data-testid="progress" data-value={value} />
  ),
}));

vi.mock('../../ui/separator', () => ({
  Separator: ({ className }: { className?: string }) => (
    <hr className={className} data-testid="separator" />
  ),
}));

vi.mock('../../ui/alert', () => ({
  Alert: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="alert">{children}</div>
  ),
  AlertDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-description">{children}</div>
  ),
}));

vi.mock('../../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu-content">{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: Function }) => (
    <div data-testid="dropdown-menu-item" onClick={() => onClick?.()}>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu-trigger">{children}</div>
  ),
}));

vi.mock('../../ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="avatar">{children}</div>
  ),
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => (
    <img src={src} alt={alt} data-testid="avatar-image" />
  ),
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="avatar-fallback">{children}</div>
  ),
}));

// Global test utilities
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));