import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/transactions/search/search.dart';
import 'package:mobile_app/features/user_data/models/models.dart';

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
            SizedBox(
                width: size.width * 0.75,
                height: kToolbarHeight,
                child: const TextField(
                  style: TextStyle(fontSize: 18),
                  decoration: InputDecoration(
                      border: InputBorder.none,
                      prefixIcon: Icon(
                        Icons.search,
                        size: 32,
                      ),
                      hintText: 'Escriba el nombre o correo',
                      hintStyle: TextStyle(color: Colors.black38)),
                )),
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
          // height: context.select(
          //      (SearchTransactionsBloc cubit) => cubit.state.isFilterActive)
          //     ? size.height - (kToolbarHeight * 3.7)
          //     : size.height - (kToolbarHeight * 2.7),
          // MediaQuery.of(context).viewInsets.bottom,
          child: ListView.builder(
              itemCount: 15,
              itemBuilder: (context, index) {
                final transaction = UserTransaction(
                    uuid: 'sjhvj-jhbjjbjb-87h8h7-dasdas-${index}56tv-hgvh76',
                    amount: '25',
                    description: 'description',
                    name: 'name',
                    date: DateTime.now(),
                    imageUrl: 'imageUrl',
                    transactionType: TransactionType.p2p);

                return TransactionCardWidget(
                  transaction: transaction,
                );
              }),
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
