import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/transactions/search/search.dart';
import 'package:mobile_app/features/transactions/search/widgets/widgets.dart';

class SearchTransactionView extends StatelessWidget {
  const SearchTransactionView({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: SizedBox(
                width: size.width * 0.75,
                height: kToolbarHeight,
                child: const SearchField(),
              ),
            ),
            InkWell(
              onTap: () {
                context
                    .read<SearchTransactionsBloc>()
                    .add(const ActiveDeactiveFilter());
              },
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 250),
                child: // TODO(@yeikel16): Change icon for transparent backgound
                    context.select((SearchTransactionsBloc cubit) =>
                            cubit.state.isFilterActive)
                        ? Image.asset(
                            'assets/icons/menu_active.png',
                            scale: 2,
                          )
                        : Image.asset(
                            'assets/icons/menu_inactive.png',
                            scale: 2,
                          ),
              ),
            )
          ],
        ),
        Builder(
          builder: (context) {
            final state = context.watch<SearchTransactionsBloc>().state;

            if (!state.isFilterActive) {
              return const SizedBox.shrink();
            }
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SizedBox(
                height: kToolbarHeight,
                child: Stack(children: [
                  AnimatedPositioned(
                    duration: const Duration(milliseconds: 150),
                    width: widthStatusLabel,
                    left: state.filterIndex,
                    child: Container(
                      height: kToolbarHeight - 8,
                      decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          gradient: kLinearGradientBlue),
                    ),
                  ),
                  Positioned(
                    width: widthStatusLabel,
                    left: 0,
                    child: GestureDetector(
                      onTap: () {
                        context
                            .read<SearchTransactionsBloc>()
                            .add(const ChangeFilterSelect(
                              select: TransactionFilterOption.all,
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
                    width: widthStatusLabel,
                    left: widthStatusLabel + 8,
                    child: GestureDetector(
                      onTap: () {
                        context
                            .read<SearchTransactionsBloc>()
                            .add(const ChangeFilterSelect(
                              select: TransactionFilterOption.send,
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
                    width: widthStatusLabel,
                    left: (widthStatusLabel * 2) + 16,
                    child: GestureDetector(
                      onTap: () {
                        context
                            .read<SearchTransactionsBloc>()
                            .add(const ChangeFilterSelect(
                              select: TransactionFilterOption.receive,
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
              if (state.isSearchTransactions) {
                return const Center(
                  child: CircularProgressIndicator(),
                );
              }
              if (state.transactions.isEmpty) {
                return const Center(
                  child: Text(
                    '0 transacciones',
                    style: TextStyle(fontSize: 18, color: Colors.black38),
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
    );
  }
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
                color: isActive ? Colors.white : Colors.black,
                fontSize: 14,
                fontWeight: FontWeight.bold),
          ),
        ),
      ),
    );
  }
}
