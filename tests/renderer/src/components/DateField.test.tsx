import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import DateField from '@zero/renderer/components/DateField';

interface Setup {
  onChange: Mock<(iso: string | undefined) => void>;
  onInvalidChange: Mock<(invalid: boolean) => void>;
  rerender: (value: string | undefined) => void;
}

function setup(value?: string): Setup {
  const onChange = vi.fn<(iso: string | undefined) => void>();
  const onInvalidChange = vi.fn<(invalid: boolean) => void>();
  const view = render(
    <DateField
      label="Início da leitura"
      value={value}
      placeholder="DD/MM/AAAA"
      onChange={onChange}
      onInvalidChange={onInvalidChange}
    />,
  );
  return {
    onChange,
    onInvalidChange,
    rerender: (next: string | undefined): void => {
      view.rerender(
        <DateField
          label="Início da leitura"
          value={next}
          placeholder="DD/MM/AAAA"
          onChange={onChange}
          onInvalidChange={onInvalidChange}
        />,
      );
    },
  };
}

function input(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>('Início da leitura');
}

describe('DateField: o campo', () => {
  it('mostra o rótulo, o exemplo e a data em ISO convertida', () => {
    setup('2026-02-10');
    expect(input()).toHaveValue('10/02/2026');
    expect(input()).toHaveAttribute('placeholder', 'DD/MM/AAAA');
    expect(input()).toHaveAttribute('inputmode', 'numeric');
  });

  it('é um campo de texto, não o calendário do navegador', () => {
    setup();
    expect(input()).toHaveAttribute('type', 'text');
  });

  it('começa vazio quando não há data', () => {
    setup();
    expect(input()).toHaveValue('');
  });
});

describe('DateField: a digitação', () => {
  it('aplica a máscara enquanto a pessoa digita', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(input(), '10022026');
    expect(input()).toHaveValue('10/02/2026');
  });

  it('devolve a data em ISO', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.type(input(), '10022026');
    expect(onChange).toHaveBeenLastCalledWith('2026-02-10');
  });

  it('apaga a data quando o campo é esvaziado', async () => {
    const user = userEvent.setup();
    const { onChange } = setup('2026-02-10');
    await user.clear(input());
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(input()).toHaveValue('');
  });

  it('aceita a data colada em ISO', () => {
    const { onChange } = setup();
    fireEvent.paste(input(), {
      clipboardData: { getData: () => '2026-02-10' },
    });
    expect(input()).toHaveValue('10/02/2026');
    expect(onChange).toHaveBeenLastCalledWith('2026-02-10');
  });

  it('deixa a colagem que não é data seguir o caminho normal', () => {
    const { onChange } = setup();
    fireEvent.paste(input(), { clipboardData: { getData: () => 'sem data' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('DateField: o texto que ainda não é data', () => {
  it('avisa o dono e não grava nada', async () => {
    const user = userEvent.setup();
    const { onChange, onInvalidChange } = setup();
    await user.type(input(), '31022026');
    expect(onInvalidChange).toHaveBeenLastCalledWith(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('mostra o aviso quando a data está completa', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(input(), '31022026');
    expect(screen.getByText('Data inválida. Use o formato DD/MM/AAAA.')).toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-invalid', 'true');
  });

  it('espera a pessoa sair do campo para avisar do texto incompleto', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(input(), '10/02/2');
    expect(screen.queryByText('Data inválida. Use o formato DD/MM/AAAA.')).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByText('Data inválida. Use o formato DD/MM/AAAA.')).toBeInTheDocument();
  });

  it('limpa o aviso quando a data fica boa', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(input(), '31022026');
    await user.clear(input());
    expect(screen.queryByText('Data inválida. Use o formato DD/MM/AAAA.')).not.toBeInTheDocument();
  });
});

describe('DateField: o dono troca a data', () => {
  it('segue o valor novo que vem de fora', () => {
    const { rerender } = setup('2026-02-10');
    rerender('2026-03-20');
    expect(input()).toHaveValue('20/03/2026');
  });

  it('não mexe no texto quando a troca veio do próprio campo', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.type(input(), '10022026');
    // O dono devolve o ISO que o campo acabou de emitir.
    onChange('2026-02-10');
    expect(input()).toHaveValue('10/02/2026');
  });
});
