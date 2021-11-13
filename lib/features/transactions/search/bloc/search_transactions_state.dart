part of 'search_transactions_bloc.dart';

class SearchTransactionsState extends Equatable {
  const SearchTransactionsState({
    this.filterIndex = 0,
    this.isFilterActive = false,
    this.filterOptionSelect = TransactionFilterOption.all,
    this.transactions = const <UserTransaction>[],
  });

  final double filterIndex;
  final bool isFilterActive;
  final TransactionFilterOption filterOptionSelect;
  final List<UserTransaction> transactions;

  @override
  List<Object> get props => [filterIndex, isFilterActive, filterOptionSelect];

  SearchTransactionsState copyWith({
    double? filterIndex,
    bool? isFilterActive,
    TransactionFilterOption? filterOptionSelect,
  }) {
    return SearchTransactionsState(
      filterIndex: filterIndex ?? this.filterIndex,
      isFilterActive: isFilterActive ?? this.isFilterActive,
      filterOptionSelect: filterOptionSelect ?? this.filterOptionSelect,
    );
  }
}
