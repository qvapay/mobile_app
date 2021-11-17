import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:bloc_concurrency/bloc_concurrency.dart';
import 'package:equatable/equatable.dart';

import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/core/extensions/extensions.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/features/transactions/repository/transactions_repository.dart';
import 'package:mobile_app/features/user_data/models/models.dart';
import 'package:rxdart/rxdart.dart';

part 'search_transactions_event.dart';
part 'search_transactions_state.dart';

enum TransactionFilterOption { none, all, send, receive }

class SearchTransactionsBloc
    extends Bloc<SearchTransactionsEvent, SearchTransactionsState> {
  SearchTransactionsBloc({
    required ITransactionsRepository transactionRepository,
  })  : _transactionRepository = transactionRepository,
        super(const SearchTransactionsState()) {
    on<GetAllTransactions>(_onGetAllTransactions);
    on<ChangeFilterSelect>(_onChangeFilterSelect);
    on<ActiveDeactiveFilter>(_onActiveDeactiveFilter);
    on<CleanFilter>(_onCleanFilter);
    on<SearchTermChanged>(
      _onSearchTermChanged,
      transformer: debounceRestartable(
        SearchTransactionsBloc.debounceSearchTermDuration,
      ),
    );
  }

  final ITransactionsRepository _transactionRepository;

  static const debounceSearchTermDuration = Duration(milliseconds: 400);

  var _filterCache = <UserTransaction>[];
  var _filterSearch = <UserTransaction>[];

  void _onChangeFilterSelect(ChangeFilterSelect event, Emitter emit) {
    switch (event.select) {
      case TransactionFilterOption.send:
        emit(state.copyWith(
          filterIndex: event.widthFilterLabel,
          filterOptionSelect: TransactionFilterOption.send,
          transactions: [
            if (_filterSearch.isNotEmpty)
              for (var x in _filterSearch
                  .where((transaction) => transaction.amount.toDouble() < 0)
                  .toList())
                x,
            if (_filterSearch.isEmpty)
              for (var x in _filterCache
                  .where((transaction) => transaction.amount.toDouble() < 0)
                  .toList())
                x
          ],
        ));
        break;
      case TransactionFilterOption.receive:
        emit(state.copyWith(
          filterIndex: event.widthFilterLabel * 2,
          filterOptionSelect: TransactionFilterOption.receive,
          transactions: [
            if (_filterSearch.isNotEmpty)
              for (var x in _filterSearch
                  .where((transaction) => transaction.amount.toDouble() > 0)
                  .toList())
                x,
            if (_filterSearch.isEmpty)
              for (var x in _filterCache
                  .where((transaction) => transaction.amount.toDouble() > 0)
                  .toList())
                x
          ],
        ));
        break;
      case TransactionFilterOption.all:
        emit(state.copyWith(
          filterIndex: 0,
          filterOptionSelect: TransactionFilterOption.all,
          transactions: [
            if (_filterSearch.isNotEmpty)
              for (var x in _filterSearch) x,
            if (_filterSearch.isEmpty)
              for (var x in _filterCache) x
          ],
        ));
        break;

      default:
        emit(state);
    }
  }

  void _onActiveDeactiveFilter(ActiveDeactiveFilter event, Emitter emit) =>
      emit(state.copyWith(filterOptionSelect: event.changeTo));

  FutureOr<void> _onGetAllTransactions(
    GetAllTransactions event,
    Emitter<SearchTransactionsState> emit,
  ) async {
    emit(state.copyWith(isSearchTransactions: true));

    final userTransactions =
        await _transactionRepository.getLatestTransactions();

    emit(userTransactions.fold(
        (error) => state.copyWith(
              errorMessage: (error as ServerFailure).message,
              isSearchTransactions: false,
            ), (transactions) {
      _filterCache = transactions;
      return state.copyWith(
        isSearchTransactions: false,
        transactions: [for (var x in transactions) x],
      );
    }));
  }

  FutureOr<void> _onSearchTermChanged(
    SearchTermChanged event,
    Emitter<SearchTransactionsState> emit,
  ) async {
    final searchTerm = NameFormz.dirty(event.searchTerm);
    emit(
      state.copyWith(
        searchTerm: searchTerm,
        isSearchTransactions: searchTerm.valid,
      ),
    );
    if (searchTerm.valid) {
      final userTransactions = await _transactionRepository
          .getLatestTransactions(searchTerm: event.searchTerm);

      emit(userTransactions.fold(
          (e) => state.copyWith(
                errorMessage: (e as ServerFailure).message,
                isSearchTransactions: false,
              ), (transactions) {
        _filterSearch = transactions;
        return state.copyWith(
          searchTerm: searchTerm,
          isSearchTransactions: !searchTerm.valid,
          transactions: [for (var x in transactions) x],
        );
      }));
    }
  }

  FutureOr<void> _onCleanFilter(
    CleanFilter event,
    Emitter<SearchTransactionsState> emit,
  ) {
    _filterSearch.clear();
    emit(
      state.copyWith(
        searchTerm: const NameFormz.pure(),
        transactions: [for (var x in _filterCache) x],
      ),
    );
  }

  EventTransformer<SearchTransactionsEvent>
      debounceRestartable<SearchTransactionsEvent>(Duration duration) {
    return (events, mapper) => restartable<SearchTransactionsEvent>()
        .call(events.debounceTime(duration), mapper);
  }
}
