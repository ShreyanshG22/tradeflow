
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1400px',
      }
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          'primary-foreground': "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          'accent-foreground': "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))"
        }
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius)",
        sm: "calc(var(--radius) - 4px)"
      },
      fontFamily: {
        sans: ["Inter var", "sans-serif"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        pulseLight: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.8" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" }
        },
        scale: {
          "0%": { transform: "scale(0.95)" },
          "100%": { transform: "scale(1)" }
        },
        slideInRight: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" }
        },
        slideInLeft: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" }
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "fade-in-up": "fadeInUp 0.8s ease-out forwards",
        "pulse-light": "pulseLight 3s infinite ease-in-out",
        "float": "float 6s ease-in-out infinite",
        "scale": "scale 0.3s ease-out forwards",
        "slide-in-right": "slideInRight 0.5s ease-out forwards",
        "slide-in-left": "slideInLeft 0.5s ease-out forwards"
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'noise': "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAAAXNSR0IArs4c6QAAA89JREFUaEPtWu1126oQPe9lAW8QbxBvEG8QZ4I4E8TdoO4GTiZwN0gmiDtBnAniBXyf4CKxDlcfQpb1yh+eX36ApAvn3nP5S3vsIwE4OMsHEfX8H0WXEJDpj5leA6Av0f+HQwh49zwsM+YVAKYU8+0BIBMPxeJjTeQlTv5TgADgCt5DLTCbDxVvvYPXgYiM0KfjnBl2Mg7z/ZIYe3QdM/HKdQKyQcB4xnQAkpXvfhKxnGNvDXBOZHy1DTgAOKfvMl4AUAcAmFYJEmkGsj4RdVnNZKZQTBkNwwAhhGOZT0ycj+HVlvhDfT8AwDVCrPYJ0DF/GQOsFoDZItQCLuITPQd2OwdOTlM/zfC6Z1KuiwDM3MNdUkVdCTDaZpNlZ6F/dAz1EZPeAZjvhVlXA4TKdOG4F8UiVtGLZKx2JR4wxB2ZaEbDU5apJXndcv8iwPnaCfPdWlQHkvlp+RBFt3jnRkAChuciU0/NZJLNKzP+4lQ0qYRtcKRFEi2ZVe0vxqoE+AK+pRmHwGvXCxdXqzDHgXm+SDk+y3eiWxPp4yxH0XY0j3qWuLbhERAZxTYfGY38bv5TnIksDohRDdyb5DGn5oRtAE4t8IrCE9LCpkK11OtGVTjRV8+3OMzs/1qYuZ7p1gA8I5Kv7OI/KZ3t0Kffa4ueIhwcL83C3wTQlLkXnxQCbHxS3KHDtHfkHKy0ysUYW2+cNfYJ8Q5/wq9hA2CQ5OSSBgFPCN4G4BFDF56rJnTRn2WR4zzO3YKNbnSkG1y6FRO3UjCbLzKHPGGlPIagtG46w7yrPDe5BaxMiPRGQMkGsWiIV5zASOIKIKWz+f5UwS9LF82JvG67qYr2MrTF3Zpa2fSxqNEZlY9L+hEqkk/R7Qpt5uv7DGSFy7VYpScfQEXcR5xFbFzlVGGBsTyB4QWfpqE+yh4sZAJgbrXEWzH6MkCK3aMR0HgDwPLG1eC7K0JVcBGVwl5PKPNx2NpLXQSIDR2VxRVh7bv16hy9P+UU211z2W0k30GrRsZMpktpS9QJRy9/A4BZ+i0FcnIgW9tGPnCOXcU0vaMOKfCr2NuOi07xYvl8KoBH3MZuPXtb2e1fwF5OA8QmxOrSTdY9KZCV32X3+2jvN7wPdGMkHJuJtmdEXpudFSVLXHKqXQ1nBRKJ54OI/mklGZnDK8jyI2w3IvQV471wCJj3x/5yiKEXBFPiSJQ+JQpnXAMgbwSwPvQNXFTL35QQ9FwE3K6jAAAAAElFTkSuQmCC')",
      }
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
