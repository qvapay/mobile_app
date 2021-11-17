import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/features/transactions/transactions.dart';

class SearchField extends StatefulWidget {
  const SearchField({
    Key? key,
  }) : super(key: key);

  @override
  State<SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends State<SearchField> {
  final _controller = TextEditingController();

  String? _searchParamsError(NameFormz searchParams) {
    if (searchParams.invalid) {
      if (searchParams.error == NameValidationError.invalid) {
        return 'Parametro de búsqueda inválido';
      } else {
        return 'Este campo no puede estar vacío';
      }
    }
    return null;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final widthFilterLabel =
        (size.width * 0.25).ceilToDouble().clamp(85.0, 110.0);
    return TextField(
      controller: _controller,
      onTap: () {
        context.read<SearchTransactionsBloc>().add(ChangeFilterSelect(
              select: TransactionFilterOption.all,
              widthFilterLabel: widthFilterLabel,
            ));
      },
      style: const TextStyle(fontSize: 18),
      onChanged: (value) => context
          .read<SearchTransactionsBloc>()
          .add(SearchTermChanged(searchTerm: value)),
      decoration: InputDecoration(
          border: InputBorder.none,
          suffix: context
                  .select((SearchTransactionsBloc t) => t.state.searchTerm.pure)
              ? null
              : IconButton(
                  onPressed: () {
                    context
                        .read<SearchTransactionsBloc>()
                        .add(const CleanFilter());
                    _controller.clear();
                    FocusScope.of(context).unfocus();
                  },
                  icon: const Icon(Icons.close),
                ),
          prefixIcon: const Icon(Icons.search, size: 32),
          hintText: 'Escriba el nombre o correo',
          hintStyle: const TextStyle(color: Colors.black38),
          errorText: _searchParamsError(context
              .select((SearchTransactionsBloc t) => t.state.searchTerm))),
    );
  }
}
