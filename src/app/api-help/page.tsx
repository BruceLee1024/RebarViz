import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API 配置帮助 | RebarViz',
  description: '给第一次接触 AI 接口的用户准备的 API、API Key、充值和计费配置说明。',
};

const PROVIDERS = [
  {
    name: 'DeepSeek',
    note: '需要在 DeepSeek 开发者平台创建 API Key，并确认账户有余额。',
  },
  {
    name: '通义千问 Qwen',
    note: '需要在阿里云 DashScope 后台开通 API 服务，并准备可用额度。',
  },
  {
    name: 'Kimi',
    note: '需要在月之暗面开放平台创建 API Key，并确认账户额度可用。',
  },
  {
    name: 'OpenAI',
    note: '要在 OpenAI Platform 配置，不是 ChatGPT 网页会员本身；通常还要开通 billing。',
  },
];

const CHECKLIST = [
  '检查 Key 是否复制完整，前后有没有多余空格。',
  '确认服务商后台已经开通 API 服务，不只是注册了账号。',
  '确认账户有余额，或者已经绑定支付方式并开通计费。',
  '确认当前默认模型对你的账号可用。',
  '如果还是失败，重新生成一个新的 API Key 再测试。',
];

export default function ApiHelpPage() {
  return (
    <main className="rv-utility-page">
      <article className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-6 md:px-8 md:py-8 border-b border-gray-100 bg-gradient-to-br from-blue-50 via-cyan-50 to-white">
          <p className="text-xs font-semibold tracking-[0.18em] text-blue-700 uppercase">RebarViz Help</p>
          <h1 className="mt-2 text-2xl md:text-3xl font-bold text-gray-900">AI 助手 API 配置帮助</h1>
          <p className="mt-3 text-sm md:text-base text-gray-600 leading-7">
            这份说明是给第一次接触 AI 接口的用户准备的。重点只讲 3 件事：
            ` API 是什么 `、` API Key 是什么 `、以及为什么配置了 Key 以后仍然可能不能用。
          </p>
        </div>

        <div className="px-6 py-6 md:px-8 md:py-8 space-y-8">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">1. API 是什么</h2>
            <p className="text-sm text-gray-700 leading-7">
              API 可以理解成“程序调用 AI 服务的入口”。RebarViz 里的 AI 助手不是直接内置在网页里的，
              它需要去调用第三方 AI 服务商的模型。
            </p>
            <p className="text-sm text-gray-700 leading-7">
              调用这些模型时，通常需要两样东西：`API Key` 和 `账户余额 / 可用额度`。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">2. API Key 是什么</h2>
            <p className="text-sm text-gray-700 leading-7">
              API Key 就像一把“调用权限钥匙”。你在服务商官网创建 Key 后，把它填到 RebarViz 的设置页，
              项目才能代表你去调用对应模型。
            </p>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 leading-7">
              API Key 不等于聊天会员，也不等于手机号验证码。它通常只在服务商自己的开发者平台里生成。
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">3. 为什么配置了 Key 还不能用</h2>
            <p className="text-sm text-gray-700 leading-7">
              最常见的原因有 4 个：Key 填错、Key 已失效、账号没有余额或没开通计费、当前模型没有访问权限。
            </p>
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 leading-7">
              最常见的是第三种：只创建了 Key，但账户没有余额。很多服务商的 API 是按调用计费的，
              所以没有额度时，接口也会直接失败。
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">4. 充值在哪里充</h2>
            <p className="text-sm text-gray-700 leading-7">
              充值不是在 RebarViz 里充，而是在各 AI 服务商官网后台充值，或者绑定支付方式并开通 billing。
            </p>
            <p className="text-sm text-gray-700 leading-7">
              一般正确流程是：注册账号、开通 API、充值或绑定支付方式、创建 API Key、回到 RebarViz 粘贴并测试。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">5. 各服务商使用提醒</h2>
            <div className="grid gap-3">
              {PROVIDERS.map((provider) => (
                <div key={provider.name} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">{provider.name}</p>
                  <p className="mt-1 text-sm text-gray-700 leading-7">{provider.note}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">6. 推荐给新手的最短路径</h2>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 leading-7">
              <li>选一个服务商。</li>
              <li>去服务商官网注册开发者账号。</li>
              <li>确认账号已经有余额，或者已经开通计费。</li>
              <li>创建 API Key。</li>
              <li>回到 RebarViz 设置页粘贴 Key。</li>
              <li>点击“测试连接”。</li>
              <li>测试通过后再开始使用 AI 助手。</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">7. 测试连接失败时怎么排查</h2>
            <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 leading-7">
              {CHECKLIST.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">8. 安全提醒</h2>
            <p className="text-sm text-gray-700 leading-7">
              不要把 API Key 发给别人，也不要把 API Key 提交到 Git 仓库里。当前 RebarViz 的设计是把 Key
              保存在浏览器本地，不上传到服务器，但你仍然应该把它当成密码一样保管。
            </p>
          </section>

          <section className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4">
            <h2 className="text-lg font-semibold text-blue-900">一句话总结</h2>
            <p className="mt-2 text-sm text-blue-800 leading-7">
              API Key 只是钥匙，账户余额才是油箱。没有余额，很多接口就算 Key 正确也跑不起来。
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
