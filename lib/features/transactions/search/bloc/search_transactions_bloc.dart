import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile_app/features/user_data/models/models.dart';

part 'search_transactions_event.dart';
part 'search_transactions_state.dart';

enum TransactionFilterOption { all, send, receive }
const widthStatusLabel = 100.0;

class SearchTransactionsBloc
    extends Bloc<SearchTransactionsEvent, SearchTransactionsState> {
  SearchTransactionsBloc() : super(const SearchTransactionsState()) {
    on<ChangeFilterSelect>(_onChangeFilterSelect);
    on<ActiveDeactiveFilter>(_onActiveDeactiveFilter);
  }

  void _onChangeFilterSelect(ChangeFilterSelect event, Emitter emit) {
    switch (event.select) {
      case TransactionFilterOption.send:
        emit(state.copyWith(
          isFilterActive: true,
          filterIndex: widthStatusLabel + 8,
          filterOptionSelect: TransactionFilterOption.send,
        ));
        break;
      case TransactionFilterOption.receive:
        emit(state.copyWith(
          isFilterActive: true,
          filterIndex: (widthStatusLabel * 2) + 16,
          filterOptionSelect: TransactionFilterOption.receive,
        ));
        break;
      default:
        emit(state.copyWith(
          isFilterActive: true,
          filterIndex: 0,
          filterOptionSelect: TransactionFilterOption.all,
        ));
    }
  }

  void _onActiveDeactiveFilter(ActiveDeactiveFilter event, Emitter emit) =>
      emit(SearchTransactionsState(isFilterActive: !state.isFilterActive));
}
