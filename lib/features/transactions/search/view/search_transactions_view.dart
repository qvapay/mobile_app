import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:formz/formz.dart';
import 'package:mobile_app/core/themes/colors.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/transactions/search/search.dart';
import 'package:mobile_app/features/transactions/search/widgets/widgets.dart';

class SearchTransactionView extends StatelessWidget {
  const SearchTransactionView({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final widthFilterLabel =
        (size.width * 0.25).ceilToDouble().clamp(85.0, 110.0);

    return BlocListener<SearchTransactionsBloc, SearchTransactionsState>(
      listenWhen: (previous, current) => current.status.isSubmissionFailure,
      listener: (context, state) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Error al comunicarse con el servidor !!'),
        ));
      },
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 6, bottom: 6),
                child: SizedBox(
                  width: size.width * 0.75,
                  height: kToolbarHeight,
                  child: const SearchField(),
                ),
              ),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 250),
                child: context.select((SearchTransactionsBloc cubit) =>
                        cubit.state.isFilterActive)
                    ? Card(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        color: Theme.of(context).primaryColor,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(10),
                          onTap: () => _onTapActiveFilter(context),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Image.asset(
                              'assets/icons/menu_active.png',
                              scale: 2,
                            ),
                          ),
                        ),
                      )
                    : Card(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        color: Theme.of(context).cardColor,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(10),
                          onTap: () => _onTapActiveFilter(context),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Image.asset(
                              'assets/icons/menu_inactive.png',
                              scale: 2,
                            ),
                          ),
                        ),
                      ),
              ),
            ],
          ),
          BlocBuilder<SearchTransactionsBloc, SearchTransactionsState>(
            builder: (context, state) {
              if (!state.isFilterActive) {
                return const SizedBox.shrink();
              }
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: SizedBox(
                  height: kToolbarHeight,
                  child: Stack(children: [
                    AnimatedPositioned(
                      duration: const Duration(milliseconds: 200),
                      width: widthFilterLabel,
                      left: state.filterIndex,
                      child: Container(
                        height: kToolbarHeight - 8,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          gradient: AppColors.linearGradientBlue,
                        ),
                      ),
                    ),
                    Positioned(
                      width: widthFilterLabel,
                      left: 0,
                      child: GestureDetector(
                        onTap: () {
                          context
                              .read<SearchTransactionsBloc>()
                              .add(const ChangeFilterSelect(
                                select: TransactionFilterOption.all,
                                widthFilterLabel: 0,
                              ));
                        },
                        child: _TextFilterWidget(
                          isActive: state.filterOptionSelect ==
                              TransactionFilterOption.all,
                          name: 'Todas',
                        ),
                      ),
                    ),
                    Positioned(
                      width: widthFilterLabel,
                      left: widthFilterLabel,
                      child: GestureDetector(
                        onTap: () {
                          context
                              .read<SearchTransactionsBloc>()
                              .add(ChangeFilterSelect(
                                select: TransactionFilterOption.send,
                                widthFilterLabel: widthFilterLabel,
                              ));
                        },
                        child: _TextFilterWidget(
                          isActive: state.filterOptionSelect ==
                              TransactionFilterOption.send,
                          name: 'Enviados',
                        ),
                      ),
                    ),
                    Positioned(
                      width: widthFilterLabel,
                      left: widthFilterLabel * 2,
                      child: GestureDetector(
                        onTap: () {
                          context
                              .read<SearchTransactionsBloc>()
                              .add(ChangeFilterSelect(
                                select: TransactionFilterOption.receive,
                                widthFilterLabel: widthFilterLabel * 2,
                              ));
                        },
                        child: _TextFilterWidget(
                          isActive: state.filterOptionSelect ==
                              TransactionFilterOption.receive,
                          name: 'Recibidos',
                        ),
                      ),
                    ),
                  ]),
                ),
              );
            },
          ),
          const SizedBox(height: 8),
          Expanded(
            child: BlocBuilder<SearchTransactionsBloc, SearchTransactionsState>(
              builder: (context, state) {
                if (state.status.isSubmissionInProgress &&
                    state.searchTerm.status != FormzInputStatus.invalid) {
                  return const Center(
                    child: CircularProgressIndicator(),
                  );
                }
                if (state.transactions.isEmpty) {
                  return Center(
                    child: Text(
                      '0 transacciones',
                      style: TextStyle(
                        fontSize: 18,
                        color: Theme.of(context).textTheme.headline1!.color,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  );
                }

                return ListView.builder(
                    itemCount: state.transactions.length,
                    itemBuilder: (context, index) {
                      return TransactionCardWidget(
                        transaction: state.transactions[index],
                      );
                    });
              },
            ),
          )
        ],
      ),
    );
  }

  void _onTapActiveFilter(BuildContext context) =>
      context.read<SearchTransactionsBloc>().add(const ActiveDeactiveFilter());
}

class _TextFilterWidget extends StatelessWidget {
  const _TextFilterWidget(
      {Key? key, required this.isActive, required this.name})
      : super(key: key);

  final String name;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: kToolbarHeight - 8,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Center(
          child: Text(
            name,
            style: TextStyle(
              color: isActive
                  ? Colors.white
                  : Theme.of(context).textTheme.headline1!.color,
              fontSize: 14,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      ),
    );
  }
}
