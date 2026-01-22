import { defineConfig, components, YamlEditor, karinPathBase } from 'node-karin'

import { Version } from '@/root'

const configDir = `${karinPathBase}/${Version.Plugin_Name}/config`

const readValue = (name: string, key: string, fallback: string) => {
  try {
    const editor = new YamlEditor(`${configDir}/${name}.yaml`)
    const value = editor.get(key)
    return value === undefined || value === null ? fallback : String(value)
  } catch {
    return fallback
  }
}

const writeConfig = (name: string, values: Record<string, string>) => {
  const editor = new YamlEditor(`${configDir}/${name}.yaml`)
  for (const [key, value] of Object.entries(values)) {
    editor.set(key, value ?? '')
  }
  editor.save()
}

const platformPanel = (name: string, label: string, extra: Array<any> = []) => {
  return components.accordion.create(`accordion_${name}`, {
    label,
    children: [
      components.accordion.createItem(`accordion_${name}_item`, {
        title: `${label} 配置`,
        subtitle: `${label} Token/Proxy/Cron`,
        children: [
          components.input.password(`${name}_token`, {
            label: `${label} Token`,
            placeholder: '请输入访问令牌',
            isClearable: true,
            defaultValue: readValue(name, 'token', ''),
          }),
          components.input.string(`${name}_proxy`, {
            label: `${label} Proxy`,
            placeholder: 'http://127.0.0.1:7890',
            isClearable: true,
            defaultValue: readValue(name, 'proxy', ''),
          }),
          components.input.string(`${name}_cron`, {
            label: `${label} Cron`,
            placeholder: '0 */5 * * * *',
            isClearable: true,
            defaultValue: readValue(name, 'cron', '0 */5 * * * *'),
          }),
          ...extra,
        ],
      }),
    ],
  })
}

export default defineConfig({
  info: {
    id: 'karin-plugin-git',
    name: 'karin-plugin-git',
    author: {
      name: 'CandriaJS',
      home: 'https://github.com/CandriaJS/karin-plugin-git',
      avatar: 'https://github.com/CandriaJS.png',
    },
    icon: {
      name: 'settings',
      size: 22,
      color: '#4B89DC',
    },
    version: Version.Plugin_Version,
    description: 'Git 平台仓库订阅推送配置',
  },
  components: () => [
    platformPanel('github', 'GitHub', [
      components.input.string('github_reverseProxy', {
        label: 'GitHub Reverse Proxy',
        placeholder: 'https://ghproxy.com/https://api.github.com',
        isClearable: true,
        defaultValue: readValue('github', 'reverseProxy', ''),
      }),
    ]),
    platformPanel('gitee', 'Gitee'),
    platformPanel('gitcode', 'GitCode'),
    platformPanel('cnb', 'CnbCool'),
    platformPanel('codeberg', 'Codeberg', [
      components.input.string('codeberg_baseUrl', {
        label: 'Codeberg Base URL',
        placeholder: 'https://codeberg.org/api/v1',
        isClearable: true,
        defaultValue: readValue(
          'codeberg',
          'baseUrl',
          'https://codeberg.org/api/v1',
        ),
      }),
    ]),
  ],
  save: (config: Record<string, string>) => {
    writeConfig('github', {
      token: config.github_token,
      proxy: config.github_proxy,
      cron: config.github_cron,
      reverseProxy: config.github_reverseProxy,
    })
    writeConfig('gitee', {
      token: config.gitee_token,
      proxy: config.gitee_proxy,
      cron: config.gitee_cron,
    })
    writeConfig('gitcode', {
      token: config.gitcode_token,
      proxy: config.gitcode_proxy,
      cron: config.gitcode_cron,
    })
    writeConfig('cnb', {
      token: config.cnb_token,
      proxy: config.cnb_proxy,
      cron: config.cnb_cron,
    })
    writeConfig('codeberg', {
      token: config.codeberg_token,
      proxy: config.codeberg_proxy,
      cron: config.codeberg_cron,
      baseUrl: config.codeberg_baseUrl,
    })

    return {
      success: true,
      message: '保存成功',
    }
  },
})
