part of 'search_transactions_bloc.dart';

class SearchTransactionsState extends Equatable {
  const SearchTransactionsState({
    this.filterIndex = 0,
    this.filterOptionSelect = TransactionFilterOption.none,
    this.status = FormzStatus.pure,
    this.searchTerm = const NameFormz.pure(),
    this.transactions = const <UserTransaction>[],
    this.errorMessage,
  });

  final double filterIndex;
  final TransactionFilterOption filterOptionSelect;
  final FormzStatus status;
  final NameFormz searchTerm;
  final List<UserTransaction> transactions;
  final String? errorMessage;

  @override
  List<Object?> get props {
    return [
      filterIndex,
      filterOptionSelect,
      status,
      searchTerm,
      transactions,
      errorMessage,
    ];
  }

  bool get isFilterActive => filterOptionSelect != TransactionFilterOption.none;

  SearchTransactionsState copyWith({
    double? filterIndex,
    TransactionFilterOption? filterOptionSelect,
    FormzStatus? status,
    NameFormz? searchTerm,
    List<UserTransaction>? transactions,
    String? errorMessage,
  }) {
    return SearchTransactionsState(
      filterIndex: filterIndex ?? this.filterIndex,
      filterOptionSelect: filterOptionSelect ?? this.filterOptionSelect,
      status: status ?? this.status,
      searchTerm: searchTerm ?? this.searchTerm,
      transactions: transactions ?? this.transactions,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }
}
